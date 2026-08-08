import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const hook = fs.readFileSync(
  path.join(ROOT, 'src/hooks/useNotlar.ts'),
  'utf8',
);
const queryKeys = fs.readFileSync(
  path.join(ROOT, 'src/lib/queryKeys.ts'),
  'utf8',
);
const queryClient = fs.readFileSync(
  path.join(ROOT, 'src/lib/queryClient.ts'),
  'utf8',
);

function between(start: string, end: string): string {
  const startIndex = hook.indexOf(start);
  const endIndex = hook.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Hook block not found: ${start} -> ${end}`);
  }
  return hook.slice(startIndex, endIndex);
}

const createBlock = between(
  'export function useCreateNot()',
  'export function useUpdateNot()',
);
const updateBlock = between(
  'export function useUpdateNot()',
  'export function useDeleteNot()',
);
const deleteBlock = between(
  'export function useDeleteNot()',
  'export function useToggleNotCompletion()',
);
const toggleBlock = between(
  'export function useToggleNotCompletion()',
  'export function useMarkAsTask()',
);
const markTaskBlock = hook.slice(
  hook.indexOf('export function useMarkAsTask()'),
);

describe('P0-S9 notes client permission/cache contract', () => {
  it('create API type and runtime payload never accept tenant or creator identity', () => {
    const insertPayload = createBlock.match(
      /\.insert\(\{([\s\S]*?)\}, \{ count: 'exact' \}\);/,
    )?.[1];

    expect(hook).toMatch(
      /export type NoteCreateInput = Omit<\s*NotInsert,\s*'isletme_id' \| 'created_by'\s*>\s*&\s*\{\s*[\s\S]*?id\?: string;/s,
    );
    expect(insertPayload).toBeTruthy();
    expect(insertPayload).not.toContain('...input');
    expect(insertPayload).not.toMatch(/\bcreated_by\s*:/);
    expect(insertPayload).toContain('isletme_id: isletme.id');
    expect(createBlock).toContain('contextModule,');
    expect(createBlock).toContain('canCreateContextNote(contextModule)');
  });

  it('client-generated UUID plus exact affected count avoids INSERT RETURNING/SELECT RLS', () => {
    expect(hook).toMatch(
      /export function createNoteId\(\): string \{\s*return Crypto\.randomUUID\(\);/s,
    );
    expect(createBlock).toContain(
      'const noteId = input.id ?? createNoteId()',
    );
    expect(createBlock).toContain('id: noteId');
    expect(createBlock).toContain("}, { count: 'exact' });");
    expect(createBlock).toContain(
      "if (count !== 1) throw new Error('PERMISSION_DENIED')",
    );
    expect(createBlock).not.toContain('.select()');
    expect(createBlock).not.toContain('.single()');
    expect(createBlock).toContain(
      'return { id: noteId, entity_type: input.entity_type }',
    );
  });

  it('update assigned-away satırı tam patch RPCsiyle scalar uuid olarak doğrular', () => {
    expect(updateBlock).toContain(
      "supabase.rpc(\n        'not_guncelle_v1'",
    );
    expect(updateBlock).toContain('p_isletme_id: isletme.id');
    expect(updateBlock).toContain('p_not_id: id');
    expect(updateBlock).toContain('p_patch: patch');
    expect(updateBlock).toContain(
      "if (data !== id) throw new Error('PERMISSION_DENIED')",
    );
    expect(updateBlock).not.toContain(".from('notlar').update");
    expect(updateBlock).not.toContain('updated_at');

    for (const key of [
      'content',
      'is_completed',
      'completed_at',
      'reminder_date',
      'photo_path',
      'assigned_to_user',
      'assigned_to_cari',
      'assigned_to_personel',
    ]) {
      expect(updateBlock).toContain(`updates.${key} !== undefined`);
      expect(updateBlock).toContain(`patch.${key} = updates.${key}`);
    }
  });

  it('delete/toggle yolları RETURNING yerine exact affected count doğrular', () => {
    for (const block of [
      deleteBlock,
      toggleBlock,
      markTaskBlock,
    ]) {
      expect(block).toContain("count: 'exact'");
      expect(block).toContain(
        "if (count !== 1) throw new Error('PERMISSION_DENIED')",
      );
      expect(block).not.toContain('.select()');
      expect(block).not.toContain('.single()');
    }
  });

  it('create fotoğrafını aynı INSERT payloadında bağlar; geniş attach RPC yüzeyi bırakmaz', () => {
    expect(createBlock).toContain(
      'photo_path: input.photo_path ?? null',
    );
    expect(hook).not.toContain('useAttachNotPhoto');
    expect(hook).not.toContain("'attach_not_photo_v1'");
  });

  it('delete commitinden sonraki reminder/storage temizliği ana sonucu gölgelemez', () => {
    const deleteCommitIndex = deleteBlock.indexOf(
      "if (count !== 1) throw new Error('PERMISSION_DENIED')",
    );
    const reminderCleanupIndex = deleteBlock.indexOf(
      'await cancelNoteReminder(note.id)',
    );

    expect(deleteCommitIndex).toBeGreaterThan(-1);
    expect(reminderCleanupIndex).toBeGreaterThan(deleteCommitIndex);
    expect(deleteBlock).toMatch(
      /try \{\s*await cancelNoteReminder\(note\.id\);[\s\S]*?catch \(reminderError\)/s,
    );
    expect(deleteBlock).toMatch(
      /try \{[\s\S]*?\.remove\(\[current\.photo_path\]\);[\s\S]*?catch \(photoCleanupError\)/s,
    );
    expect(deleteBlock).toContain(
      "'[Notes] reminder cleanup failed after delete:'",
    );
    expect(deleteBlock).toContain(
      "'[Notes] photo cleanup failed after delete:'",
    );
  });

  it('not cache keyini kullanıcı ve etkin yetki imzasıyla ayırır', () => {
    expect(queryKeys).toContain("'scoped-v2'");
    expect(queryKeys).toContain("'byEntity-v2'");
    expect(queryKeys).toMatch(
      /notlar:[\s\S]*?list:[\s\S]*?userId: string[\s\S]*?permissionFingerprint: string/s,
    );
    expect(queryKeys).toMatch(
      /byEntity:[\s\S]*?userId: string[\s\S]*?permissionFingerprint: string/s,
    );

    for (const flag of [
      'canSeeNotes',
      'canSeeAccounts',
      'canSeeCariler',
      'canSeePersonnel',
      'canSeeProducts',
      'canSeeAllUsersData',
    ]) {
      expect(hook).toContain(flag);
    }
  });

  it('hassas not sorgularını diske yazmaz ve hata/refetchte eski satırı maskeler', () => {
    expect(hook).toContain("persist: false");
    expect(hook).toContain("query_purpose: 'notes:scoped-v2'");
    expect(hook.match(/meta: NOTE_QUERY_META/g)).toHaveLength(2);
    expect(hook.match(/queryResult\.isRefetchError/g)).toHaveLength(2);
    expect(hook.match(/data: mustMaskCachedRows \? \[\] : queryResult\.data/g))
      .toHaveLength(2);
    expect(queryClient).toContain("-s7`");
  });

  it('genel liste kapalı kaynakları OR ile geri istemez; kaynak tipini daraltıp AND RLSye bırakır', () => {
    const listBlock = between(
      'export function useNotlar(',
      'export function useNotlarByEntity(',
    );
    expect(listBlock).toContain(
      "query = query.in('entity_type', permittedTypes)",
    );
    expect(listBlock).not.toContain('query.or(');
    expect(listBlock).not.toContain('assigned_to_cari.not.is.null');
    expect(listBlock).not.toContain('assigned_to_personel.not.is.null');
  });
});
