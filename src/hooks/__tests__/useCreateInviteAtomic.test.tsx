import fs from 'fs';
import path from 'path';
import React, { type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCreateInvite } from '@/hooks/useMultiUser';
import type { Permissions } from '@/types/multiUser';

const mockIsletme = { id: 'business-1' };
let queryClient: QueryClient;

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    isletme: mockIsletme,
  }),
}));

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

async function flushQueryNotifications() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('useCreateInvite atomic member label contract', () => {
  const rpcMock = supabase.rpc as jest.Mock;
  const fromMock = supabase.from as jest.Mock;
  const permissions = {
    modules: { cariler: true },
  } as unknown as Permissions;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('creates the invite and member label with one v2 RPC call', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'ABCXYZ', error: null });
    const hook = renderHook(() => useCreateInvite(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          role: 'custom',
          roleLabel: 'Özel',
          permissions,
          email: 'invite@example.test',
          memberLabel: '  Kasiyer Ahmet  ',
        }),
      ).resolves.toBe('ABCXYZ');
      await flushQueryNotifications();
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('create_isletme_invite_v2', {
      p_isletme_id: 'business-1',
      p_role: 'custom',
      p_role_label: 'Özel',
      p_permissions: permissions,
      p_invited_email: 'invite@example.test',
      p_member_label: 'Kasiyer Ahmet',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('sends a blank member label as null without a follow-up update', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'DEFUVW', error: null });
    const hook = renderHook(() => useCreateInvite(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await hook.result.current.mutateAsync({
        role: 'operator',
        memberLabel: '   ',
      });
      await flushQueryNotifications();
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      'create_isletme_invite_v2',
      expect.objectContaining({ p_member_label: null }),
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not attempt a table update when the RPC fails', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42501', message: 'owner only' },
    });
    const hook = renderHook(() => useCreateInvite(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        hook.result.current.mutateAsync({
          role: 'operator',
          memberLabel: 'Kasiyer',
        }),
      ).rejects.toMatchObject({ code: '42501' });
      await flushQueryNotifications();
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('davet ve üye düzenleme alanlarını sunucudaki 100 karakter sınırıyla eşler', () => {
    const inviteSource = fs.readFileSync(
      path.join(process.cwd(), 'src/app/ayarlar/davet-olustur.tsx'),
      'utf8',
    );
    const editSource = fs.readFileSync(
      path.join(process.cwd(), 'src/components/multiUser/UserEditSheet.tsx'),
      'utf8',
    );

    expect(inviteSource).toMatch(
      /value=\{memberName\}[\s\S]*?maxLength=\{100\}/,
    );
    expect(editSource).toMatch(
      /value=\{memberLabel\}[\s\S]*?maxLength=\{100\}/,
    );
  });
});
