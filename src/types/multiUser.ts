import { Isletme } from './database';

// Roller ve durumlar
export type UserRole = 'manager' | 'operator' | 'purchaser' | 'custom';
export type UserStatus = 'active' | 'suspended' | 'removed';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';
export type AuditAction = 'create' | 'update' | 'delete';

// Modül isimleri
export type ModuleName =
  | 'dashboard'
  | 'hesaplar'
  | 'cariler'
  | 'personel'
  | 'islemler'
  | 'kategoriler'
  | 'raporlar'
  | 'cekler'
  | 'nakit_avans'
  | 'ileri_tarihli'
  | 'urunler'
  | 'notlar'
  | 'arsiv'
  | 'ayarlar';

// Sade model: tek global yetki seviyesi (kademeli, açık tüm modüllere geçerli).
//   view = açık modüllerde tüm kayıtları gör; add = + ekle;
//   edit_own = + yalnızca kendi eklediğini düzenle/sil; edit_all = + tümünü.
export type PermissionLevel = 'view' | 'add' | 'edit_own' | 'edit_all';

// Yetki yapısı (JSONB permissions kolonu ile eşleşir)
export interface Permissions {
  modules: Record<ModuleName, boolean>;
  // YENİ (sade model): tek global yetki seviyesi. Yoksa aşağıdaki legacy `actions`
  // kullanılır (geçiş dönemi; tüm kullanıcılar level'a geçince actions/visibility/
  // restrictions kaldırılacak).
  level?: PermissionLevel;
  // @deprecated — sade modelde `level` ile değişti. Geçiş için korunuyor.
  actions: {
    [module: string]: {
      can_create: boolean;
      can_update_own: boolean;
      can_update_all: boolean;
      can_delete_own: boolean;
      can_delete_all: boolean;
    };
  };
  visibility: {
    can_see_passive: boolean;
    can_see_archived: boolean;
    can_see_all_users_data: boolean;
  };
  restrictions?: {
    cari_types?: ('musteri' | 'tedarikci')[];
    islem_types?: string[];
    max_transaction_amount?: number;
  };
}

// Profil (auth.users trigger ile oluşturulur)
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Davet
export interface IsletmeInvite {
  id: string;
  isletme_id: string;
  invited_by: string;
  invite_code: string;
  invited_email: string | null;
  role: UserRole;
  role_label: string | null;
  permissions: Permissions;
  expires_at: string;
  status: InviteStatus;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  // Relations
  inviter?: Profile;
  isletme?: Isletme;
}

// İşletme kullanıcısı
export interface IsletmeUser {
  id: string;
  isletme_id: string;
  user_id: string;
  invite_id: string | null;
  role: UserRole;
  role_label: string | null;
  permissions: Permissions;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  // Relations
  profile?: Profile;
  isletme?: Isletme;
}

// Rol şablonu
export interface RoleTemplate {
  id: string;
  name: string;
  label_tr: string;
  label_en: string;
  description_tr: string | null;
  description_en: string | null;
  default_permissions: Permissions;
  sort_order: number;
  is_system: boolean;
}

// Audit log kaydı
export interface IslemAuditLog {
  id: string;
  isletme_id: string;
  islem_id: string | null;
  action: AuditAction;
  performed_by: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  // Relations
  performer?: Profile;
}

// Audit log filtre parametreleri
export interface AuditLogFilters {
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
}
