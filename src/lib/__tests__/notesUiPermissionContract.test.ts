import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('P0-S9 note UI permission and photo lifecycle contract', () => {
  it('shared NoteListRow update/delete/toggle/task gestures use exact own/all gates', () => {
    const row = read('src/components/notes/NoteListRow.tsx');

    expect(row).toContain(
      "canUpdate('notlar', note.created_by)",
    );
    expect(row).toContain(
      "canDelete('notlar', note.created_by)",
    );
    expect(row).toContain(
      'canUpdateContextNote(contextModule, note.created_by)',
    );
    expect(row).toContain(
      'canDeleteContextNote(contextModule, note.created_by)',
    );
    expect(row).toContain(
      'onEdit={canUpdateNote ? handleEdit : undefined}',
    );
    expect(row).toContain(
      'onToggleComplete={canUpdateNote ? onToggleComplete : undefined}',
    );
    expect(row).toContain(
      'onMarkAsTask={canUpdateNote ? onMarkAsTask : undefined}',
    );
    expect(row).toContain(
      'onDelete={canDeleteNote ? handleDelete : undefined}',
    );
  });

  it.each([
    'src/app/personel/[id].tsx',
    'src/app/personel/izin-gecmisi/[id].tsx',
    'src/app/urunler/[id].tsx',
  ])('%s direct NoteRow yerine permission-aware NoteListRow kullanır', (screen) => {
    const source = read(screen);
    expect(source).toContain(
      "import { NoteListRow } from '@/components/notes/NoteListRow'",
    );
    expect(source).toContain('<NoteListRow');
    expect(source).not.toContain(
      "import { NoteRow } from '@/components/notes/NoteRow'",
    );
  });

  it('detay notları parent modül bağlamını taşır ve own/all okuma filtresi uygulamaz', () => {
    const cari = read('src/app/cariler/[id].tsx');
    const personel = read('src/app/personel/[id].tsx');
    const hesap = read('src/app/hesaplar/[id].tsx');
    const urun = read('src/app/urunler/[id].tsx');

    expect(cari).toContain('contextModule="cariler"');
    expect(personel).toContain('contextModule="personel"');
    expect(hesap).toContain('contextModule="hesaplar"');
    expect(urun).toContain('contextModule="urunler"');
    expect(cari).toContain('const entityNotes = rawEntityNotes');
    expect(cari).not.toMatch(
      /const entityNotes = useMemo\([\s\S]{0,200}note\.created_by === user\?\.id/,
    );
  });

  it('detail handlers permission reddini gösterir ve note mutation hatalarını sessiz yutmaz', () => {
    const handlers = read('src/hooks/useDetailNoteHandlers.ts');

    expect(handlers).toContain('isPermissionDeniedError(error)');
    expect(handlers).toContain(
      "t('common:errors.permissionDenied')",
    );
    expect(handlers).not.toContain('catch { /* ignore');
    expect(handlers).toContain(
      'await toggleNotCompletion.mutateAsync',
    );
    expect(handlers).toContain('await markAsTask.mutateAsync');
    expect(handlers).toContain('await deleteNot.mutateAsync');
  });

  it('create photo upload-first aynı INSERTe gider; update copy-on-write güvenli temizler', () => {
    const addButton = read('src/components/notes/AddNoteButton.tsx');
    const notesPage = read('src/app/notlar/index.tsx');
    const detailHandlers = read('src/hooks/useDetailNoteHandlers.ts');
    const photoHook = read('src/hooks/useNotePhoto.ts');

    for (const source of [addButton, notesPage]) {
      const uploadIndex = source.indexOf(
        'uploadedPhotoPath = await',
      );
      const insertIndex = source.indexOf(
        'await createNot.mutateAsync',
      );

      expect(source).toContain('const noteId = createNoteId()');
      expect(source).toContain('id: noteId');
      expect(source).toContain('photo_path: uploadedPhotoPath');
      expect(uploadIndex).toBeGreaterThan(-1);
      expect(insertIndex).toBeGreaterThan(uploadIndex);
      expect(source).toContain(
        "classifyMutationError(error) !== 'network_unknown'",
      );
      expect(source).toContain(
        'await removeNotePhotoBestEffort(uploadedPhotoPath)',
      );
      expect(source).not.toContain('useAttachNotPhoto');
      expect(source).not.toContain('attachNotPhoto.mutateAsync');
      expect(source).toContain('isPermissionDeniedError');
      expect(source).toContain(
        "t('common:notes.reminderUpdateFailed')",
      );
    }

    const leaveHistory = read(
      'src/app/personel/izin-gecmisi/[id].tsx',
    );
    for (const source of [notesPage, detailHandlers, leaveHistory]) {
      expect(source).toContain('uploadedPhotoPath');
      expect(source).toContain('removeNotePhotoBestEffort');
      expect(source).toContain('photo_path: nextPhotoPath');
      expect(source).toContain('let noteUpdated = false');
      expect(source).toContain('noteUpdated = true');
      expect(source).toContain('&& !noteUpdated');
      expect(source).toContain(
        "classifyMutationError(error) !== 'network_unknown'",
      );
      expect(source).toContain(
        "t('common:notes.reminderUpdateFailed')",
      );
    }

    expect(photoHook).toContain(
      'await removeNotePhotoBestEffort(path)',
    );
    expect(photoHook).toContain('throw uploadError');
    expect(photoHook).toMatch(
      /export async function removeNotePhotoBestEffort[\s\S]*?try \{[\s\S]*?catch \(error\)/s,
    );
  });
});
