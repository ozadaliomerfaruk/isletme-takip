import React, { memo, useCallback } from 'react';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { NoteRow } from './NoteRow';
import type { Not } from '@/types/database';

interface NoteListRowProps {
  note: Not;
  /** Düzenleme — id'yi sarmalayıcı bağlar; çağıran stabil setter/handler geçer. */
  onEditId: (id: string) => void;
  /** Silme — id'yi sarmalayıcı bağlar. */
  onDeleteId: (id: string) => void;
  onToggleComplete?: (id: string, done: boolean) => void;
  onMarkAsTask?: (id: string) => void;
  onPhotoPress?: (photoPath: string) => void;
  deleteLabel?: string;
  /** Bitişik düz-liste görünümü (cari detay) — satır altı boşluk yok. */
  flush?: boolean;
}

/**
 * FlashList listelerinde not satırı için memo'lu sarmalayıcı. onEdit/onDelete'i
 * inline arrow yerine note.id'ye bağlı STABİL useCallback olarak üretir; böylece
 * NoteRow gereksiz yere her parent render'ında yeniden render olmaz.
 */
function NoteListRowInner({
  note,
  onEditId,
  onDeleteId,
  onToggleComplete,
  onMarkAsTask,
  onPhotoPress,
  deleteLabel,
  flush,
}: NoteListRowProps) {
  const handleEdit = useCallback(() => onEditId(note.id), [onEditId, note.id]);
  const handleDelete = useCallback(() => onDeleteId(note.id), [onDeleteId, note.id]);

  return (
    <SwipeableRow itemKey={note.id} onDelete={handleDelete} deleteLabel={deleteLabel} flush={flush}>
      <NoteRow
        note={note}
        onEdit={handleEdit}
        onToggleComplete={onToggleComplete}
        onMarkAsTask={onMarkAsTask}
        onPhotoPress={onPhotoPress}
      />
    </SwipeableRow>
  );
}

export const NoteListRow = memo(NoteListRowInner);
