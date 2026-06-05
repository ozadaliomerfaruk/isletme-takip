import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/appEvents';
import { queryKeys, invalidateRelatedQueries } from '@/lib/queryKeys';
import { useAuthContext } from '@/contexts/AuthContext';
import type {
  IsletmeUser,
  IsletmeInvite,
  Profile,
  UserRole,
  UserStatus,
  Permissions,
  RoleTemplate,
} from '@/types/multiUser';
import type { Isletme } from '@/types/database';
import i18n from '@/i18n';

// İşletme kullanıcıları (owner ve yetkili paylaşılan kullanıcılar görebilir)
export function useIsletmeUsers() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.users(isletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isletme_users')
        .select('*, profile:profiles(*)')
        .eq('isletme_id', isletme!.id)
        .neq('status', 'removed');
      if (error) throw error;
      return data as IsletmeUser[];
    },
    enabled: !!isletme,
  });
}

// Bekleyen davetler (owner ve yetkili paylaşılan kullanıcılar görebilir)
export function useIsletmeInvites() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.invites(isletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isletme_invites')
        .select('*')
        .eq('isletme_id', isletme!.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      return data as IsletmeInvite[];
    },
    enabled: !!isletme,
  });
}

// Davet oluştur (RPC)
export function useCreateInvite() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      role: UserRole;
      roleLabel?: string;
      permissions?: Permissions;
      email?: string;
    }) => {
      const { data, error } = await supabase.rpc('create_isletme_invite', {
        p_isletme_id: isletme!.id,
        p_role: params.role,
        p_role_label: params.roleLabel ?? null,
        p_permissions: params.permissions ?? null,
        p_invited_email: params.email ?? null,
      });
      if (error) throw error;
      return data as string; // invite_code
    },
    onSuccess: (_data, variables) => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
      logEvent('invite_created', { role: variables.role });
    },
  });
}

// Daveti kabul et (RPC)
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_isletme_invite', {
        p_code: code,
      });
      if (error) throw error;
      return data as string; // isletme_id
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Paylaşılan işletmeler (kullanıcının erişimi olan başka işletmeler)
export function useSharedIsletmeler() {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.sharedIsletmeler(user?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isletme_users')
        .select('*, isletme:isletmeler(*)')
        .eq('user_id', user!.id)
        .eq('status', 'active');
      if (error) throw error;
      return data as (IsletmeUser & { isletme: Isletme })[];
    },
    enabled: !!user,
  });
}

// Profil bilgisi (kullanıcı detayları)
export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.profiles.detail(userId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 dakika cache
  });
}

// Kullanıcı durumunu güncelle (suspend/activate/remove)
export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      isletmeId: string;
      status: 'active' | 'suspended' | 'removed';
    }) => {
      const { error } = await supabase
        .from('isletme_users')
        .update({ status: params.status })
        .eq('user_id', params.userId)
        .eq('isletme_id', params.isletmeId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Daveti iptal et
export function useCancelInvite() {
  const { isletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      if (!isletme) throw new Error(i18n.t('common:errors.businessNotFound'));
      const { error } = await supabase
        .from('isletme_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId)
        .eq('isletme_id', isletme.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Kullanıcı rol ve yetkilerini güncelle (owner only)
export function useUpdateIsletmeUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      userId: string;
      isletmeId: string;
      role: UserRole;
      roleLabel?: string | null;
      permissions?: Permissions;
      status?: UserStatus;
    }) => {
      const updateData: Record<string, unknown> = {
        role: params.role,
        role_label: params.roleLabel ?? null,
      };
      if (params.permissions) {
        updateData.permissions = params.permissions;
      }
      if (params.status) {
        updateData.status = params.status;
      }

      const { error } = await supabase
        .from('isletme_users')
        .update(updateData)
        .eq('user_id', params.userId)
        .eq('isletme_id', params.isletmeId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Rol şablonları (tüm authenticated kullanıcılar okuyabilir)
export function useRoleTemplates() {
  return useQuery({
    queryKey: queryKeys.multiUser.roleTemplates(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as RoleTemplate[];
    },
    staleTime: 30 * 60 * 1000, // 30 dakika cache (nadiren değişir)
  });
}

// İşletmeden ayrıl (shared user kendi kendini kaldırır)
export function useLeaveIsletme() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isletmeId: string) => {
      const { error } = await supabase
        .from('isletme_users')
        .update({ status: 'removed' })
        .eq('user_id', user!.id)
        .eq('isletme_id', isletmeId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}
