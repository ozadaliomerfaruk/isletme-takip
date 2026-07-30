import { act, renderHook } from '@testing-library/react-native';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useTopAnchoredListSnapshot } from '@/hooks/useTopAnchoredListSnapshot';

type Meta = { scope: string; version: number };

const EMPTY_META: Meta = { scope: 'empty', version: 0 };

function scrollEvent(
  y: number,
): NativeSyntheticEvent<NativeScrollEvent> {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

describe('useTopAnchoredListSnapshot', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('deep scroll sırasında meta/header değişimini tepeye dönüp settle olana kadar bekletir', () => {
    const firstMeta: Meta = { scope: 'tenant-a', version: 1 };
    const secondMeta: Meta = { scope: 'tenant-a', version: 2 };
    const hook = renderHook(({ meta }: { meta: Meta }) =>
      useTopAnchoredListSnapshot({
        asyncMeta: meta,
        emptyAsyncMeta: EMPTY_META,
        initialHeaderHeight: 100,
        scopeKey: 'tenant-a:user-a:permission-a',
      }), {
        initialProps: { meta: firstMeta },
      });

    act(() => {
      hook.result.current.onScrollBeginDrag(scrollEvent(0));
      hook.result.current.onScroll(scrollEvent(320));
      hook.result.current.onScrollEndDrag(scrollEvent(320));
      hook.result.current.onMomentumScrollBegin(scrollEvent(320));
    });

    hook.rerender({ meta: secondMeta });
    act(() => {
      hook.result.current.onHeaderHeightChange(124);
      hook.result.current.onMomentumScrollEnd(scrollEvent(340));
    });

    expect(hook.result.current.stableAsyncMeta).toBe(firstMeta);
    expect(hook.result.current.headerHeight).toBe(100);

    act(() => {
      hook.result.current.onScrollBeginDrag(scrollEvent(340));
      hook.result.current.onScroll(scrollEvent(0));
      hook.result.current.onScrollEndDrag(scrollEvent(0));
      jest.advanceTimersByTime(47);
    });
    expect(hook.result.current.stableAsyncMeta).toBe(firstMeta);
    expect(hook.result.current.headerHeight).toBe(100);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(hook.result.current.stableAsyncMeta).toBe(secondMeta);
    expect(hook.result.current.headerHeight).toBe(124);
  });

  it('programatik scroll eventleri bitmeden pending geometriyi uygulamaz', () => {
    const firstMeta: Meta = { scope: 'tenant-a', version: 1 };
    const secondMeta: Meta = { scope: 'tenant-a', version: 2 };
    const hook = renderHook(({ meta }: { meta: Meta }) =>
      useTopAnchoredListSnapshot({
        asyncMeta: meta,
        emptyAsyncMeta: EMPTY_META,
        initialHeaderHeight: 100,
        scopeKey: 'tenant-a:user-a:permission-a',
      }), {
        initialProps: { meta: firstMeta },
      });

    act(() => {
      hook.result.current.onScroll(scrollEvent(300));
      jest.advanceTimersByTime(48);
    });
    hook.rerender({ meta: secondMeta });

    act(() => {
      hook.result.current.onHeaderHeightChange(120);
      hook.result.current.onScroll(scrollEvent(80));
      jest.advanceTimersByTime(30);
      hook.result.current.onScroll(scrollEvent(0));
      jest.advanceTimersByTime(47);
    });
    expect(hook.result.current.stableAsyncMeta).toBe(firstMeta);
    expect(hook.result.current.headerHeight).toBe(100);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(hook.result.current.stableAsyncMeta).toBe(secondMeta);
    expect(hook.result.current.headerHeight).toBe(120);
  });

  it('aynı scope içindeki geçici undefined değerde son hazır snapshotı korur', () => {
    const readyMeta: Meta = { scope: 'tenant-a', version: 1 };
    const hook = renderHook(
      ({ meta }: { meta: Meta | undefined }) =>
        useTopAnchoredListSnapshot({
          asyncMeta: meta,
          emptyAsyncMeta: EMPTY_META,
          initialHeaderHeight: 100,
          scopeKey: 'tenant-a:user-a:permission-a',
        }),
      {
        initialProps: { meta: readyMeta as Meta | undefined },
      },
    );

    hook.rerender({ meta: undefined });

    expect(hook.result.current.stableAsyncMeta).toBe(readyMeta);
  });

  it('scope değişince eski meta ve header yüksekliğini aynı renderda temizler', () => {
    const readyMeta: Meta = { scope: 'tenant-a', version: 1 };
    const hook = renderHook(
      ({
        meta,
        initialHeaderHeight,
        scopeKey,
      }: {
        meta: Meta | undefined;
        initialHeaderHeight: number;
        scopeKey: string;
      }) => useTopAnchoredListSnapshot({
        asyncMeta: meta,
        emptyAsyncMeta: EMPTY_META,
        initialHeaderHeight,
        scopeKey,
      }),
      {
        initialProps: {
          meta: readyMeta as Meta | undefined,
          initialHeaderHeight: 100,
          scopeKey: 'tenant-a:user-a:permission-a',
        },
      },
    );

    act(() => {
      hook.result.current.onHeaderHeightChange(126);
      hook.result.current.onScrollBeginDrag(scrollEvent(0));
      hook.result.current.onScroll(scrollEvent(300));
    });
    expect(hook.result.current.headerHeight).toBe(126);

    hook.rerender({
      meta: undefined,
      initialHeaderHeight: 92,
      scopeKey: 'tenant-b:user-b:permission-b',
    });

    expect(hook.result.current.stableAsyncMeta).toBe(EMPTY_META);
    expect(hook.result.current.headerHeight).toBe(92);
  });
});
