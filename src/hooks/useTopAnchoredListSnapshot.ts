import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

const DEFAULT_TOP_THRESHOLD = 24;
const HEADER_HEIGHT_EPSILON = 0.5;
const SCROLL_SETTLE_DELAY_MS = 48;

interface UseTopAnchoredListSnapshotOptions<T> {
  /** Undefined means "not ready yet" and retains the last ready snapshot. */
  asyncMeta: T | undefined;
  /** Scope-safe value used before the first ready snapshot and after scope reset. */
  emptyAsyncMeta: T;
  initialHeaderHeight: number;
  /** Tenant/business identity. A scope change must never retain old metadata. */
  scopeKey: string;
  /**
   * Pending geometry may be committed only this close to the list origin.
   * Main-list headers are much taller than this threshold, so applying here
   * cannot displace a deep visible row.
   */
  topThreshold?: number;
}

interface TopAnchoredListSnapshotResult<T> {
  stableAsyncMeta: T;
  headerHeight: number;
  onHeaderHeightChange: (height: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => void;
  onScrollEndDrag: (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => void;
  onMomentumScrollBegin: (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => void;
  onMomentumScrollEnd: (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => void;
}

function readScrollOffset(
  event: NativeSyntheticEvent<NativeScrollEvent>,
): number {
  const offset = event.nativeEvent.contentOffset.y;
  return Number.isFinite(offset) ? Math.max(0, offset) : 0;
}

/**
 * Keeps async row metadata and floating-header padding from changing visible
 * list geometry after the user has left the top of the list.
 *
 * Updates received during drag/momentum (or while resting deep in the list)
 * are staged. They are committed together only when the list returns to its
 * origin. This avoids fighting variable-height/expandable rows with
 * `maintainVisibleContentPosition` and does not set React state per scroll
 * frame; offsets and dirty flags live in refs.
 */
export function useTopAnchoredListSnapshot<T>({
  asyncMeta,
  emptyAsyncMeta,
  initialHeaderHeight,
  scopeKey,
  topThreshold = DEFAULT_TOP_THRESHOLD,
}: UseTopAnchoredListSnapshotOptions<T>): TopAnchoredListSnapshotResult<T> {
  const initialAsyncMeta = asyncMeta ?? emptyAsyncMeta;
  const [stableAsyncMeta, setStableAsyncMeta] = useState(initialAsyncMeta);
  const [headerHeight, setHeaderHeight] = useState(initialHeaderHeight);

  const scopeKeyRef = useRef(scopeKey);
  const stableAsyncMetaRef = useRef(initialAsyncMeta);
  const pendingAsyncMetaRef = useRef(initialAsyncMeta);
  const stableHeaderHeightRef = useRef(initialHeaderHeight);
  const pendingHeaderHeightRef = useRef(initialHeaderHeight);
  const asyncMetaDirtyRef = useRef(false);
  const headerHeightDirtyRef = useRef(false);
  const isInteractingRef = useRef(false);
  const scrollOffsetRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeChangedDuringRender = scopeKeyRef.current !== scopeKey;

  // Tenant değişiminde eski snapshot bir render karesi dahi dışarı verilmez.
  // useLayoutEffect ref/state'i boyamadan önce yeni scope ile eşitler; aşağıdaki
  // return guard'ı da bu render sırasında doğrudan yeni metadata'yı döndürür.
  useLayoutEffect(() => {
    if (scopeKeyRef.current === scopeKey) return;

    const resetAsyncMeta = asyncMeta ?? emptyAsyncMeta;
    scopeKeyRef.current = scopeKey;
    stableAsyncMetaRef.current = resetAsyncMeta;
    pendingAsyncMetaRef.current = resetAsyncMeta;
    asyncMetaDirtyRef.current = false;
    stableHeaderHeightRef.current = initialHeaderHeight;
    pendingHeaderHeightRef.current = initialHeaderHeight;
    headerHeightDirtyRef.current = false;
    isInteractingRef.current = false;
    scrollOffsetRef.current = 0;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setStableAsyncMeta(resetAsyncMeta);
    setHeaderHeight(initialHeaderHeight);
  }, [asyncMeta, emptyAsyncMeta, initialHeaderHeight, scopeKey]);

  const canCommitGeometry = useCallback(
    () =>
      !isInteractingRef.current
      && scrollOffsetRef.current <= topThreshold,
    [topThreshold],
  );

  const commitPendingGeometry = useCallback(() => {
    if (!canCommitGeometry()) return;

    if (asyncMetaDirtyRef.current) {
      const nextMeta = pendingAsyncMetaRef.current;
      asyncMetaDirtyRef.current = false;
      if (!Object.is(stableAsyncMetaRef.current, nextMeta)) {
        stableAsyncMetaRef.current = nextMeta;
        setStableAsyncMeta(nextMeta);
      }
    }

    if (headerHeightDirtyRef.current) {
      const nextHeight = pendingHeaderHeightRef.current;
      headerHeightDirtyRef.current = false;
      if (
        Math.abs(stableHeaderHeightRef.current - nextHeight)
        >= HEADER_HEIGHT_EPSILON
      ) {
        stableHeaderHeightRef.current = nextHeight;
        setHeaderHeight(nextHeight);
      }
    }
  }, [canCommitGeometry]);

  useEffect(() => {
    // Query refetches may temporarily expose undefined. That is not a new
    // geometry snapshot; retain the last ready value until data is ready.
    if (asyncMeta === undefined) return;

    if (!Object.is(pendingAsyncMetaRef.current, asyncMeta)) {
      pendingAsyncMetaRef.current = asyncMeta;
      asyncMetaDirtyRef.current =
        !Object.is(stableAsyncMetaRef.current, asyncMeta);
    }
    commitPendingGeometry();
  }, [asyncMeta, commitPendingGeometry]);

  const onHeaderHeightChange = useCallback((height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;

    pendingHeaderHeightRef.current = height;
    headerHeightDirtyRef.current =
      Math.abs(stableHeaderHeightRef.current - height)
      >= HEADER_HEIGHT_EPSILON;
    commitPendingGeometry();
  }, [commitPendingGeometry]);

  useEffect(() => {
    onHeaderHeightChange(initialHeaderHeight);
  }, [initialHeaderHeight, onHeaderHeightChange]);

  const clearSettleTimer = useCallback(() => {
    if (!settleTimerRef.current) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const scheduleSettledCommit = useCallback(() => {
    clearSettleTimer();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      isInteractingRef.current = false;
      commitPendingGeometry();
    }, SCROLL_SETTLE_DELAY_MS);
  }, [clearSettleTimer, commitPendingGeometry]);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const onScroll = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    scrollOffsetRef.current = readScrollOffset(event);
    // Programmatic scrolls do not consistently emit drag callbacks. Treat a
    // free-standing scroll event as interaction and flush only after events
    // have settled, never while the animation is still producing frames.
    if (!isInteractingRef.current || settleTimerRef.current !== null) {
      isInteractingRef.current = true;
      scheduleSettledCommit();
    }
  }, [scheduleSettledCommit]);

  const onScrollBeginDrag = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    clearSettleTimer();
    isInteractingRef.current = true;
    scrollOffsetRef.current = readScrollOffset(event);
  }, [clearSettleTimer]);

  const onScrollEndDrag = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    scrollOffsetRef.current = readScrollOffset(event);
    // MomentumScrollBegin follows EndDrag on a fling. Keep interaction locked
    // through a short settle window so that gap cannot commit late metadata.
    scheduleSettledCommit();
  }, [scheduleSettledCommit]);

  const onMomentumScrollBegin = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    clearSettleTimer();
    isInteractingRef.current = true;
    scrollOffsetRef.current = readScrollOffset(event);
  }, [clearSettleTimer]);

  const onMomentumScrollEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    clearSettleTimer();
    scrollOffsetRef.current = readScrollOffset(event);
    isInteractingRef.current = false;
    commitPendingGeometry();
  }, [clearSettleTimer, commitPendingGeometry]);

  return {
    stableAsyncMeta: scopeChangedDuringRender
      ? (asyncMeta ?? emptyAsyncMeta)
      : stableAsyncMeta,
    headerHeight: scopeChangedDuringRender
      ? initialHeaderHeight
      : headerHeight,
    onHeaderHeightChange,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
  };
}
