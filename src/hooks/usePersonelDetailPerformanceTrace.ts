import { useEffect, useRef } from 'react';
import { logPerformanceEvent } from '@/lib/appEvents';
import { msSinceForeground } from '@/lib/supabase';
import {
  createPerformanceTraceId,
  getRecentEntityPerformanceTrace,
  takeEntityNavigationPerformanceTrace,
  type RecentEntityPerformanceTrace,
} from '@/lib/performanceTrace';

const STALL_THRESHOLD_MS = 8_000;
const ABANDONED_THRESHOLD_MS = 2_000;

interface PersonelDetailPerformanceInput {
  personelId: string | undefined;
  personelReady: boolean;
  transactionsReady: boolean;
  productsReady: boolean;
  scheduledReady: boolean;
  notesReady: boolean;
  leaveReady: boolean;
  personelError: boolean;
  transactionsError: boolean;
  productsError: boolean;
  scheduledError: boolean;
  notesError: boolean;
  leaveError: boolean;
  personelCacheAtMount: boolean;
  transactionsCacheAtMount: boolean;
  productsCacheAtMount: boolean;
  scheduledCacheAtMount: boolean;
  notesCacheAtMount: boolean;
  leaveCacheAtMount: boolean;
  transactionCount: number;
  productLookupCount: number;
  noteCount: number;
  scheduledCount: number;
}

type ReadyMarks = Partial<Record<
  | 'personel_ready_ms'
  | 'transactions_ready_ms'
  | 'products_ready_ms'
  | 'scheduled_ready_ms'
  | 'notes_ready_ms'
  | 'leave_ready_ms',
  number
>>;

export function usePersonelDetailPerformanceTrace(
  input: PersonelDetailPerformanceInput,
): void {
  const startedAtRef = useRef(Date.now());
  const traceIdRef = useRef(
    createPerformanceTraceId('personel-detail', startedAtRef.current),
  );
  const sourceSaveRef = useRef(
    getRecentEntityPerformanceTrace(
      'personel',
      input.personelId,
      startedAtRef.current,
    ),
  );
  const navigationRef = useRef<RecentEntityPerformanceTrace | null | undefined>(
    undefined,
  );
  if (navigationRef.current === undefined) {
    navigationRef.current = takeEntityNavigationPerformanceTrace(
      'personel',
      input.personelId,
      startedAtRef.current,
    );
  }
  const initialCacheRef = useRef({
    personel: input.personelCacheAtMount,
    transactions: input.transactionsCacheAtMount,
    products: input.productsCacheAtMount,
    scheduled: input.scheduledCacheAtMount,
    notes: input.notesCacheAtMount,
    leave: input.leaveCacheAtMount,
  });
  const marksRef = useRef<ReadyMarks>({});
  const completedRef = useRef(false);
  const stallLoggedRef = useRef(false);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  useEffect(() => {
    const elapsed = Date.now() - startedAtRef.current;
    const marks = marksRef.current;
    if (input.personelReady && marks.personel_ready_ms === undefined) {
      marks.personel_ready_ms = elapsed;
    }
    if (input.transactionsReady && marks.transactions_ready_ms === undefined) {
      marks.transactions_ready_ms = elapsed;
    }
    if (input.productsReady && marks.products_ready_ms === undefined) {
      marks.products_ready_ms = elapsed;
    }
    if (input.scheduledReady && marks.scheduled_ready_ms === undefined) {
      marks.scheduled_ready_ms = elapsed;
    }
    if (input.notesReady && marks.notes_ready_ms === undefined) {
      marks.notes_ready_ms = elapsed;
    }
    if (input.leaveReady && marks.leave_ready_ms === undefined) {
      marks.leave_ready_ms = elapsed;
    }
  }, [
    input.leaveReady,
    input.notesReady,
    input.personelReady,
    input.productsReady,
    input.scheduledReady,
    input.transactionsReady,
  ]);

  const allReady =
    input.personelReady
    && input.transactionsReady
    && input.productsReady
    && input.scheduledReady
    && input.notesReady
    && input.leaveReady;

  useEffect(() => {
    if (!allReady || completedRef.current) return;
    const dataReadyAt = Date.now();
    const frame = requestAnimationFrame(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      const paintedAt = Date.now();
      const sourceSave = sourceSaveRef.current;
      const navigation = navigationRef.current;
      const latest = latestInputRef.current;
      logPerformanceEvent('personel_detail_trace', {
        trace_id: traceIdRef.current,
        source_save_trace_id: sourceSave?.traceId ?? null,
        ms_since_save: sourceSave?.ageMs ?? null,
        navigation_trace_id: navigation?.traceId ?? null,
        navigation_to_mount_ms: navigation?.ageMs ?? null,
        navigation_to_paint_ms:
          navigation ? navigation.ageMs + (paintedAt - startedAtRef.current) : null,
        total_ms: paintedAt - startedAtRef.current,
        data_ready_ms: dataReadyAt - startedAtRef.current,
        render_settle_ms: paintedAt - dataReadyAt,
        ...marksRef.current,
        initial_personel_cache: initialCacheRef.current.personel,
        initial_transactions_cache: initialCacheRef.current.transactions,
        initial_products_cache: initialCacheRef.current.products,
        initial_scheduled_cache: initialCacheRef.current.scheduled,
        initial_notes_cache: initialCacheRef.current.notes,
        initial_leave_cache: initialCacheRef.current.leave,
        personel_error: latest.personelError,
        transactions_error: latest.transactionsError,
        products_error: latest.productsError,
        scheduled_error: latest.scheduledError,
        notes_error: latest.notesError,
        leave_error: latest.leaveError,
        transaction_count: latest.transactionCount,
        product_lookup_count: latest.productLookupCount,
        note_count: latest.noteCount,
        scheduled_count: latest.scheduledCount,
        had_stall_event: stallLoggedRef.current,
        ms_since_fg: msSinceForeground(),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [allReady]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (completedRef.current) return;
      stallLoggedRef.current = true;
      const latest = latestInputRef.current;
      logPerformanceEvent('personel_detail_stall', {
        trace_id: traceIdRef.current,
        source_save_trace_id: sourceSaveRef.current?.traceId ?? null,
        ms_since_save: sourceSaveRef.current?.ageMs ?? null,
        navigation_trace_id: navigationRef.current?.traceId ?? null,
        navigation_to_mount_ms: navigationRef.current?.ageMs ?? null,
        elapsed_ms: Date.now() - startedAtRef.current,
        ...marksRef.current,
        pending_personel: !latest.personelReady,
        pending_transactions: !latest.transactionsReady,
        pending_products: !latest.productsReady,
        pending_scheduled: !latest.scheduledReady,
        pending_notes: !latest.notesReady,
        pending_leave: !latest.leaveReady,
        ms_since_fg: msSinceForeground(),
      });
    }, STALL_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    if (completedRef.current) return;
    const elapsedMs = Date.now() - startedAtRef.current;
    if (elapsedMs < ABANDONED_THRESHOLD_MS) return;
    const latest = latestInputRef.current;
    logPerformanceEvent('personel_detail_abandoned', {
      trace_id: traceIdRef.current,
      source_save_trace_id: sourceSaveRef.current?.traceId ?? null,
      ms_since_save: sourceSaveRef.current?.ageMs ?? null,
      navigation_trace_id: navigationRef.current?.traceId ?? null,
      navigation_to_mount_ms: navigationRef.current?.ageMs ?? null,
      elapsed_ms: elapsedMs,
      ...marksRef.current,
      pending_personel: !latest.personelReady,
      pending_transactions: !latest.transactionsReady,
      pending_products: !latest.productsReady,
      pending_scheduled: !latest.scheduledReady,
      pending_notes: !latest.notesReady,
      pending_leave: !latest.leaveReady,
      ms_since_fg: msSinceForeground(),
    });
  }, []);
}
