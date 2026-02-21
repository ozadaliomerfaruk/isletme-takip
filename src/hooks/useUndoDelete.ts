import { useState, useRef, useCallback, useEffect } from 'react';

const UNDO_TIMEOUT_MS = 5000;

interface PendingDelete<T> {
  id: string;
  item: T;
  description: string;
}

interface UseUndoDeleteOptions<T> {
  onCommitDelete: (id: string) => Promise<void>;
  onError?: (error: unknown) => void;
}

interface UseUndoDeleteResult<T> {
  /** Set of IDs that are pending deletion (use to filter from UI) */
  pendingDeleteIds: Set<string>;
  /** Start a soft-delete: hide from UI, start 5s timer */
  requestDelete: (id: string, item: T, description: string) => void;
  /** Undo the pending delete: restore to UI */
  undoDelete: () => void;
  /** Dismiss snackbar and commit immediately */
  dismissDelete: () => void;
  /** Snackbar state */
  snackbar: {
    visible: boolean;
    message: string;
  };
}

export function useUndoDelete<T>(options: UseUndoDeleteOptions<T>): UseUndoDeleteResult<T> {
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const pendingRef = useRef<PendingDelete<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs for callbacks — prevents infinite re-render loops
  // when consumers pass inline functions
  const onCommitDeleteRef = useRef(options.onCommitDelete);
  const onErrorRef = useRef(options.onError);
  onCommitDeleteRef.current = options.onCommitDelete;
  onErrorRef.current = options.onError;

  // Commit the actual deletion
  const commitDelete = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;

    pendingRef.current = null;
    setSnackbarVisible(false);

    try {
      await onCommitDeleteRef.current(pending.id);
    } catch (error) {
      // Delete failed - restore item to UI
      setPendingDeleteIds(prev => {
        const next = new Set(prev);
        next.delete(pending.id);
        return next;
      });
      onErrorRef.current?.(error);
    }
  }, []);

  // Start a soft-delete
  const requestDelete = useCallback((id: string, item: T, description: string) => {
    // If there's already a pending delete, commit it immediately
    if (pendingRef.current && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const prevPending = pendingRef.current;
      pendingRef.current = null;

      // Commit previous delete in background
      onCommitDeleteRef.current(prevPending.id).catch(error => {
        setPendingDeleteIds(prev => {
          const next = new Set(prev);
          next.delete(prevPending.id);
          return next;
        });
        onErrorRef.current?.(error);
      });
    }

    // Set new pending delete
    pendingRef.current = { id, item, description };
    setPendingDeleteIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSnackbarMessage(`"${description}" silindi`);
    setSnackbarVisible(true);

    // Start 5s timer
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      commitDelete();
    }, UNDO_TIMEOUT_MS);
  }, [commitDelete]);

  // Undo: cancel timer, restore item
  const undoDelete = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    if (pending) {
      setPendingDeleteIds(prev => {
        const next = new Set(prev);
        next.delete(pending.id);
        return next;
      });
      pendingRef.current = null;
    }

    setSnackbarVisible(false);
  }, []);

  // Dismiss: commit immediately
  const dismissDelete = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commitDelete();
  }, [commitDelete]);

  // Cleanup on unmount only (empty deps = runs once)
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        // On unmount, commit pending delete
        const pending = pendingRef.current;
        if (pending) {
          onCommitDeleteRef.current(pending.id).catch(() => {});
        }
      }
    };
  }, []);

  return {
    pendingDeleteIds,
    requestDelete,
    undoDelete,
    dismissDelete,
    snackbar: {
      visible: snackbarVisible,
      message: snackbarMessage,
    },
  };
}
