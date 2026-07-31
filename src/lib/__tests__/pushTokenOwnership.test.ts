import fs from 'node:fs';
import path from 'node:path';

import { buildUnambiguousPushTokenMap } from '../../../supabase/functions/_shared/pushTokenOwnership';
import { fetchUnambiguousPushTokenMap } from '../../../supabase/functions/_shared/pushTokenOwnership';

describe('push token ownership privacy guard', () => {
  it('keeps a token owned by exactly one user', () => {
    const row = { user_id: 'user-a', token: 'token-a', locale: 'tr' };
    const result = buildUnambiguousPushTokenMap([row]);

    expect(result.byUserId.get('user-a')).toBe(row);
    expect(result.ambiguousTokens.size).toBe(0);
  });

  it('fails closed for every user sharing the same device token', () => {
    const result = buildUnambiguousPushTokenMap([
      { user_id: 'user-a', token: 'shared-token' },
      { user_id: 'user-b', token: 'shared-token' },
      { user_id: 'user-c', token: 'safe-token' },
    ]);

    expect(result.ambiguousTokens).toEqual(new Set(['shared-token']));
    expect(result.byUserId.has('user-a')).toBe(false);
    expect(result.byUserId.has('user-b')).toBe(false);
    expect(result.byUserId.get('user-c')).toEqual({
      user_id: 'user-c',
      token: 'safe-token',
    });
  });

  it('chunks safe-recipient RPC calls and fails closed only for an errored chunk', async () => {
    const fetchChunk = jest.fn()
      .mockResolvedValueOnce({
        data: [{ user_id: 'user-a', token: 'token-a' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'temporary failure' },
      });

    const result = await fetchUnambiguousPushTokenMap(
      ['user-a', 'user-b', 'user-c'],
      fetchChunk,
      2,
    );

    expect(fetchChunk).toHaveBeenNthCalledWith(
      1,
      ['user-a', 'user-b'],
    );
    expect(fetchChunk).toHaveBeenNthCalledWith(2, ['user-c']);
    expect(result.byUserId.get('user-a')?.token).toBe('token-a');
    expect(result.byUserId.has('user-c')).toBe(false);
    expect(result.failedChunkMessages).toEqual(['temporary failure']);
  });

  it('is used by all three push senders with no per-user token query', () => {
    const read = (relativePath: string) =>
      fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    const linked = read(
      'supabase/functions/notify-linked-users/index.ts',
    );
    const scheduled = read(
      'supabase/functions/process-scheduled-transactions/index.ts',
    );
    const zReport = read('supabase/functions/send-z-report/index.ts');

    for (const source of [linked, scheduled, zReport]) {
      expect(source).toContain('fetchUnambiguousPushTokenMap');
      expect(source).toContain(
        '"get_unambiguous_push_tokens_v1"',
      );
      expect(source).not.toContain('.from("push_tokens")');
    }
    expect(linked).not.toContain('.eq("user_id", userId)');
    expect(linked).toContain(
      'recipientContexts.flatMap((context) => context.userIds)',
    );
  });
});
