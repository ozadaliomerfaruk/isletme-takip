import { act, renderHook } from '@testing-library/react-native';
import { useUndoDelete } from '@/hooks/useUndoDelete';

describe('useUndoDelete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('undo bekleyen silmeyi iptal eder, satiri geri getirir ve timer commit etmez', async () => {
    const onCommitDelete = jest.fn(async () => undefined);
    const { result } = renderHook(() =>
      useUndoDelete<{ id: string }>({
        onCommitDelete,
      }),
    );

    act(() => {
      result.current.requestDelete(
        'islem-1',
        { id: 'islem-1' },
        'Test islemi',
      );
    });

    expect(result.current.pendingDeleteIds.has('islem-1')).toBe(true);
    expect(result.current.snackbar.visible).toBe(true);

    act(() => {
      result.current.undoDelete();
    });

    expect(result.current.pendingDeleteIds.has('islem-1')).toBe(false);
    expect(result.current.snackbar.visible).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(onCommitDelete).not.toHaveBeenCalled();
  });

  it('commit aninda request sirasinda dogrulanan satiri callbacke tasir', async () => {
    const onCommitDelete = jest.fn(async () => undefined);
    const item = { id: 'islem-2', photo_path: 'verified-before-delete.webp' };
    const { result } = renderHook(() =>
      useUndoDelete<typeof item>({
        onCommitDelete,
      }),
    );

    act(() => {
      result.current.requestDelete(item.id, item, 'Fotoğraflı işlem');
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(onCommitDelete).toHaveBeenCalledTimes(1);
    expect(onCommitDelete).toHaveBeenCalledWith(item.id, item);
  });

  it('commit hatasinda satiri geri yukler ve tuketicinin hata bildirimini cagirir', async () => {
    const commitError = new Error('delete failed');
    const onCommitDelete = jest.fn(async () => {
      throw commitError;
    });
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useUndoDelete<{ id: string }>({
        onCommitDelete,
        onError,
      }),
    );

    act(() => {
      result.current.requestDelete(
        'urun-1',
        { id: 'urun-1' },
        'Test urunu',
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(onCommitDelete).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(commitError);
    expect(result.current.pendingDeleteIds.has('urun-1')).toBe(false);
    expect(result.current.snackbar.visible).toBe(false);
  });
});
