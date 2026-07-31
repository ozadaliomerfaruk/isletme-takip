import React, { memo, useCallback } from 'react';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { usePermissions } from '@/hooks/usePermissions';
import { NoteRow } from './NoteRow';
import type { Not } from '@/types/database';
import type { ContextNoteParentModule } from '@/hooks/useNotlar';

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
  /** Bağlı kayıt view/pending durumunda satırı göster, bütün yazma jestlerini kapat. */
  readOnly?: boolean;
  /** Bitişik düz-liste görünümü (cari detay) — satır altı boşluk yok. */
  flush?: boolean;
  /** Entity detayındaki not yazmaları parent modülün own/all kuralını kullanır. */
  contextModule?: ContextNoteParentModule;
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
  readOnly = false,
  flush,
  contextModule,
}: NoteListRowProps) {
  const {
    canUpdate,
    canDelete,
    canUpdateContextNote,
    canDeleteContextNote,
  } = usePermissions();
  const canUpdateNote =
    !readOnly
    && (
      contextModule
        ? canUpdateContextNote(contextModule, note.created_by)
        : canUpdate('notlar', note.created_by)
    );
  const canDeleteNote =
    !readOnly
    && (
      contextModule
        ? canDeleteContextNote(contextModule, note.created_by)
        : canDelete('notlar', note.created_by)
    );
  const handleEdit = useCallback(() => onEditId(note.id), [onEditId, note.id]);
  const handleDelete = useCallback(() => onDeleteId(note.id), [onDeleteId, note.id]);

  return (
    <SwipeableRow
      itemKey={note.id}
      onDelete={canDeleteNote ? handleDelete : undefined}
      deleteLabel={deleteLabel}
      flush={flush}
    >
      <NoteRow
        note={note}
        onEdit={canUpdateNote ? handleEdit : undefined}
        onToggleComplete={canUpdateNote ? onToggleComplete : undefined}
        onMarkAsTask={canUpdateNote ? onMarkAsTask : undefined}
        onPhotoPress={onPhotoPress}
        canModifyOverride={canUpdateNote}
      />
    </SwipeableRow>
  );
}

export const NoteListRow = memo(NoteListRowInner);
