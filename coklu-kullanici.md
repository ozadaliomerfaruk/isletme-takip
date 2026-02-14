# Çoklu Kullanıcı (Multi-User) Özelliği - Final Plan v5

> **v5 Güncellemesi:** Yetki görünürlük stratejisi, yetki düzenleme UI'ı ve İşlem Geçmişi (Audit Log) özelliği eklendi.

---

## Geriye Dönük Uyumluluk Analizi

> **Kontrol Tarihi:** 2026-01-21
> **Sonuç:** ✅ Plan geriye dönük uyumlu, mevcut kullanıcıları ETKİLEMEZ

### Özet Tablo

| Değişiklik Türü | Güvenli mi? | Açıklama |
|-----------------|-------------|----------|
| RLS Policy değişiklikleri | ✅ | Owner kontrolü HER policy'de İLK sırada |
| Yeni kolonlar (created_by, vb.) | ✅ | DEFAULT NULL + migration ile doldurulacak |
| Yeni tablolar (profiles, vb.) | ✅ | Mevcut işleyişi değiştirmiyor |
| Audit trigger | ✅ | COALESCE ile NULL-safe |
| Soft delete | ✅ | Mevcut kayıtlarda deleted_at = NULL |
| AuthContext genişletmesi | ✅ | Mevcut alanlar korunuyor |

### Kritik Güvenlik Mekanizması

```sql
-- HER policy bu pattern'i kullanıyor:
CREATE POLICY "..." ON table FOR ...
  TO authenticated USING (
    -- ✅ İLK: Owner kontrolü (mevcut ile AYNI)
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Shared user kontrolü (yeni, owner'ları ETKİLEMEZ)
    EXISTS (SELECT 1 FROM isletme_users iu ...)
  );
```

**Neden güvenli:**
- PostgreSQL `OR` operatörü dalları herhangi bir sırada değerlendirebilir (short-circuit garantisi YOK), ancak bu güvenlik açığı oluşturmaz
- Owner condition mevcut RLS pattern ile BİREBİR AYNI
- `isletme_users` tablosu başlangıçta BOŞ → shared user condition `EXISTS` her zaman FALSE döner
- **Not:** OR dallarının değerlendirilme sırası bir performans meselesidir, güvenlik meselesi değil

### Migration Güvenlik Sırası

1. ✅ Yeni tablolar oluştur (profiles, isletme_users, role_templates, isletme_invites)
2. ✅ Yeni kolonlar ekle (created_by, updated_by, deleted_at, deleted_by)
3. ✅ **Mevcut kayıtları owner'a ata** ← KRİTİK
4. ✅ RLS policy'leri güncelle (DROP + CREATE)
5. ✅ Trigger'ları ekle

### Production Öncesi Checklist

- [ ] STAGING ortamında test et
- [ ] Veritabanı yedeği al
- [ ] Migration'ı transaction içinde çalıştır
- [ ] Mevcut owner'ın verilerine erişebildiğini doğrula

---

## Mevcut Altyapı

### Tablo Yapıları
| Tablo | isletme_id | is_archived | is_active | created_by | RLS |
|-------|------------|-------------|-----------|------------|-----|
| isletmeler | - | - | - | ❌ | ✅ |
| hesaplar | ✅ | ✅ | ✅ | ❌ | ✅ FOR ALL |
| islemler | ✅ | ❌ | ❌ | ❌ | ✅ FOR ALL |
| cariler | ✅ | ✅ | ✅ | ❌ | ✅ FOR ALL |
| personel | ✅ | ✅ | ✅ | ❌ | ✅ FOR ALL |
| kategoriler | ✅ | ❌ | ✅ | ❌ | ✅ FOR ALL |
| cekler | ✅ | ❌ | ❌ | ❌ | ✅ Ayrı |
| nakit_avanslar | ✅ | ❌ | ❌ | ❌ | ✅ Ayrı |
| ileri_tarihli_islemler | ✅ | ❌ | ❌ | ❌ | ✅ Ayrı |
| urunler | ✅ | ❌ | ✅ | ❌ | ✅ FOR ALL |
| urun_hareketler | ✅ | ❌ | ❌ | ❌ | ✅ FOR ALL |

### Mevcut RLS Pattern
```sql
isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
```

### Mevcut Fonksiyonlar (Zaten Var)
- `update_updated_at()` - Tüm tablolarda kullanılıyor ✅
- `check_kategori_no_cycle()` - Kategori döngü kontrolü ✅
- `check_kategori_type_match()` - Kategori tip eşleşme ✅

---

## Kararlar

| Karar | Seçim |
|-------|-------|
| Owner tanımı | Sadece `isletmeler.user_id` (tek kaynak) |
| Davet sistemi | Ayrı `isletme_invites` tablosu |
| Kullanıcı yönetimi | **Sadece owner** |
| Geçmiş kayıtlar | Sahibe atansın |
| Profil sistemi | profiles tablosu |
| İşletme switch | Ayarlardan geçiş |
| Pasif/arşiv kontrolü | **RLS'te de kontrol** (fonksiyon ile) |
| created_by | **DB trigger ile otomatik** (SECURITY DEFINER) |
| Yetkisiz sayfa | **Gizle** (gösterme, yönlendirme yok) |
| Silinen işlemler | **Hard delete + audit log** (mevcut bakiye geri alma korunur, `islem_audit_log` tablosuna kayıt) |

---

## Yetki Görünürlük Stratejisi

> **ÖNEMLİ:** Kullanıcıya yetkisi olmayan içerikler hiç gösterilmez. "Yetkiniz yok" mesajı yerine o öğeler tamamen gizlenir.

| Bileşen | Yetkisiz Durumda | Uygulama Detayı |
|---------|------------------|-----------------|
| **Tab bar** | Gizle | `(tabs)/_layout.tsx`'te yetkisiz modüller filter edilir |
| **Menü öğeleri** | Gizle | `daha.tsx`'te `canAccessModule` kontrolü ile conditional render |
| **Sayfa içi butonlar** | Gizle | `PermissionGate` ile `fallback={null}` |
| **Liste öğeleri** | Göster | Görebilir ama düzenleme/silme butonu gizli |
| **Floating action button** | Gizle | `canCreate` kontrolü ile conditional render |

### Tab Bar Filtreleme Örneği

> **ÖNEMLİ:** Expo Router file-based routing kullanır. `Tabs.Screen` deklarasyonları STATİK olmalıdır. Dinamik `filter().map()` ile render YAPILMAZ, uygulama bozulur. Yetkisiz tab'lar `href: null` ile gizlenir.

```typescript
// src/app/(tabs)/_layout.tsx

export default function TabLayout() {
  const { canAccessModule } = usePermissions();

  return (
    <Tabs screenOptions={{...}}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analitik"
        options={{
          href: null, // Analitik her zaman gizli (mevcut davranış)
          title: t('tabs.analytics'),
          tabBarIcon: ({ color }) => <BarChart3 size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cariler"
        options={{
          href: canAccessModule('cariler') ? '/(tabs)/cariler' : null,
          title: t('tabs.clients'),
          tabBarIcon: ({ color }) => <Users size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          href: canAccessModule('personel') ? '/(tabs)/personel' : null,
          title: t('tabs.personnel'),
          tabBarIcon: ({ color }) => <UserCircle size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="urunler"
        options={{
          href: canAccessModule('urunler') ? '/(tabs)/urunler' : null,
          title: t('tabs.stock'),
          tabBarIcon: ({ color }) => <Package size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="daha"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color }) => <MoreHorizontal size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

### Sayfa Seviyesi Yetki Kontrolü

```typescript
// Sayfa açılırken kontrol (redirect yerine boş sayfa)
export default function PersonelPage() {
  const { canAccessModule } = usePermissions();

  // Yetkisiz ise hiçbir şey gösterme
  if (!canAccessModule('personel')) {
    return null; // veya <EmptyState message="..." /> gösterilebilir
  }

  return (
    // Normal sayfa içeriği
  );
}
```

---

## Kullanıcı Yetkisi Düzenleme

> Owner, mevcut kullanıcıların rollerini ve yetkilerini değiştirebilir.

### UI Akışı

```
Kullanıcılar Sayfası
    ↓
Kullanıcı kartına tıkla
    ↓
Bottom Sheet açılır:
├── Profil bilgileri (read-only)
├── Mevcut rol
├── Rol değiştir dropdown
│   ├── Yönetici
│   ├── Operatör
│   ├── Satın Almacı
│   └── Özel
├── [Özel seçilirse] Yetki checkboxları
├── Durumu değiştir (Aktif/Askıya Al)
├── [Kaydet] butonu
└── [Kullanıcıyı Kaldır] butonu (tehlikeli)
```

### Yeni Bileşen: UserEditSheet

```typescript
// src/components/multiUser/UserEditSheet.tsx

interface UserEditSheetProps {
  user: IsletmeUser;
  visible: boolean;
  onClose: () => void;
}

export function UserEditSheet({ user, visible, onClose }: UserEditSheetProps) {
  const { t } = useTranslation('multiUser');
  const [role, setRole] = useState(user.role);
  const [permissions, setPermissions] = useState(user.permissions);
  const [status, setStatus] = useState(user.status);

  const updateUser = useUpdateIsletmeUser();
  const removeUser = useRemoveIsletmeUser();

  const handleSave = async () => {
    await updateUser.mutateAsync({
      userId: user.user_id,
      isletmeId: user.isletme_id,
      role,
      permissions: role === 'custom' ? permissions : undefined,
      status,
    });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Profil bilgisi */}
      <UserProfileCard profile={user.profile} />

      {/* Rol seçimi */}
      <RoleSelector value={role} onChange={setRole} />

      {/* Özel yetki ayarları (role === 'custom' ise) */}
      {role === 'custom' && (
        <PermissionEditor
          value={permissions}
          onChange={setPermissions}
        />
      )}

      {/* Durum toggle */}
      <StatusToggle value={status} onChange={setStatus} />

      {/* Kaydet */}
      <Button onPress={handleSave} loading={updateUser.isPending}>
        {t('common:buttons.save')}
      </Button>

      {/* Kaldır (tehlikeli) */}
      <Button
        variant="danger"
        onPress={() => {/* confirm dialog */}}
      >
        {t('users.removeUser')}
      </Button>
    </BottomSheet>
  );
}
```

### Yetki Düzenleme Bileşeni

```typescript
// src/components/multiUser/PermissionEditor.tsx

// Modül bazlı checkbox grupları
// - Dashboard: ☑ Görüntüle
// - Hesaplar: ☑ Görüntüle ☑ Oluştur ☐ Düzenle ☐ Sil
// - Cariler: ☑ Görüntüle ☑ Oluştur ☑ Düzenle ☐ Sil
// ...

interface PermissionEditorProps {
  value: Permissions;
  onChange: (permissions: Permissions) => void;
}
```

---

## İşlem Geçmişi (Audit Log) - YENİ ÖZELLİK

> Patron, personelin sildiği ve düzenlediği işlemleri görebilir ve kurtarabilir.

### Özellik Özeti

| Özellik | Detay |
|---------|-------|
| Erişim | **Sadece owner** |
| Silinenler | Audit log'da kalıcı olarak kayıtlı (hard delete + log) |
| Düzenlenenler | Tüm düzenleme geçmişi görüntülenebilir |
| Kurtarma | Log'daki `old_data` ile yeni işlem olarak yeniden oluşturulabilir |
| Bilgi | Kim sildi/düzenledi, ne zaman |

### Veritabanı Değişiklikleri

> **v6 DEĞİŞİKLİĞİ:** Soft delete yaklaşımı **KALDIRILDI**. Yerine `islem_audit_log` tablosu kullanılacak.
>
> **Neden:** Mevcut `useDeleteIslem` hook'u (`src/hooks/useIslemler.ts:527-573`) 13+ işlem tipi için `reverseBalances()` çağırarak bakiyeleri geri alır, sonra hard delete yapar. Soft delete'e geçmek, bu bakiye geri alma mantığının tamamını SQL'e taşımayı gerektirir - çok karmaşık ve hata riski yüksek. Ayrıca `restore_islem` fonksiyonu bakiyeleri tekrar uygulamadığı için veri tutarsızlığına yol açar.

```sql
-- =============================================
-- İŞLEM AUDIT LOG TABLOSU (Soft delete YERİNE)
-- =============================================
-- Mevcut hard delete + bakiye reversal korunur
-- Silme/düzenleme olayları bu tabloya kaydedilir
-- Owner "İşlem Geçmişi" sayfasında bunları görebilir

CREATE TABLE islem_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  islem_id UUID,  -- NULL olabilir (silinen işlemler için referans kaybolur)
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  old_data JSONB,  -- önceki değer (update/delete için)
  new_data JSONB,  -- yeni değer (create/update için)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_isletme ON islem_audit_log(isletme_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON islem_audit_log(isletme_id, action) WHERE action = 'delete';

ALTER TABLE islem_audit_log ENABLE ROW LEVEL SECURITY;

-- Sadece owner görebilir
CREATE POLICY "Owner can view audit log" ON islem_audit_log FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE policy yok → client doğrudan yazamaz
-- Tüm log insert'leri DB trigger'ları ile yapılır (SECURITY DEFINER)

-- Düzenlenen işlemler için index (updated_by farklı ise)
CREATE INDEX idx_islemler_edited ON islemler(isletme_id, updated_at)
  WHERE updated_by IS NOT NULL AND updated_by != created_by;

-- =============================================
-- AUDIT LOG TRİGGER'LARI (Client yerine DB seviyesinde)
-- =============================================
-- Neden trigger: Client crash/offline/race-condition durumunda
-- log yazılmadan delete/update gerçekleşebilir.
-- Trigger ile log HER ZAMAN atomik olarak tutulur.

CREATE OR REPLACE FUNCTION log_islem_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO islem_audit_log (isletme_id, islem_id, action, performed_by, old_data)
  VALUES (
    OLD.isletme_id,
    OLD.id,
    'delete',
    auth.uid(),
    to_jsonb(OLD)
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION log_islem_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO islem_audit_log (isletme_id, islem_id, action, performed_by, old_data, new_data)
  VALUES (
    OLD.isletme_id,
    OLD.id,
    'update',
    auth.uid(),
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_islem_audit_delete
  BEFORE DELETE ON islemler
  FOR EACH ROW EXECUTE FUNCTION log_islem_delete();

CREATE TRIGGER trg_islem_audit_update
  BEFORE UPDATE ON islemler
  FOR EACH ROW EXECUTE FUNCTION log_islem_update();
```

**Nasıl çalışır:**
- `useDeleteIslem`: Mevcut hard delete + `reverseBalances()` KORUNUR. Client'ta log yazmaya **gerek yok** - DB trigger (`trg_islem_audit_delete`) otomatik olarak `old_data` kaydeder.
- `useUpdateIslem`: Client'ta log yazmaya **gerek yok** - DB trigger (`trg_islem_audit_update`) otomatik olarak `old_data` + `new_data` kaydeder.
- **Kurtarma:** Owner "İşlem Geçmişi"nde silinen işlemi görüp "Yeniden Oluştur" derse, `old_data`'dan yeni işlem oluşturulur. Bakiyeler `useCreateIslem` tarafından doğru hesaplanır.
- **Avantaj:** Mevcut bakiye mantığı hiç bozulmaz. Trigger atomik olduğu için log her zaman tutulur (client crash/offline bile olsa).
- **90 gün sonra temizlik:** `pg_cron` ile eski loglar silinir.

### Yeni Sayfa: İşlem Geçmişi

```typescript
// src/app/ayarlar/islem-gecmisi.tsx

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';
import { useDeletedIslemler, useEditedIslemler, useRestoreIslem } from '@/hooks/useAuditLog';
import { UserAvatar } from '@/components/UserAvatar';

type Tab = 'deleted' | 'edited';

export default function IslemGecmisiPage() {
  const { t } = useTranslation(['multiUser', 'common']);
  const { isOwner } = useAuthContext();
  const [activeTab, setActiveTab] = useState<Tab>('deleted');

  // Sadece owner erişebilir
  if (!isOwner) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('multiUser:auditLog.title'),
          headerBackTitle: t('common:buttons.back'),
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'deleted' && styles.tabActive]}
            onPress={() => setActiveTab('deleted')}
          >
            <Text
              variant="label"
              color={activeTab === 'deleted' ? 'primary' : 'secondary'}
            >
              {t('multiUser:auditLog.tabs.deleted')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'edited' && styles.tabActive]}
            onPress={() => setActiveTab('edited')}
          >
            <Text
              variant="label"
              color={activeTab === 'edited' ? 'primary' : 'secondary'}
            >
              {t('multiUser:auditLog.tabs.edited')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Warning Banner */}
        {activeTab === 'deleted' && (
          <View style={styles.warningBanner}>
            <Text variant="caption" color="warning">
              {t('multiUser:auditLog.autoDeleteWarning')}
            </Text>
          </View>
        )}

        {/* Content */}
        <ScrollView style={styles.scrollView}>
          {activeTab === 'deleted' ? (
            <DeletedTransactionsList />
          ) : (
            <EditedTransactionsList />
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function DeletedTransactionsList() {
  const { t } = useTranslation('multiUser');
  const { data: islemler, isLoading } = useDeletedIslemler();
  const restoreIslem = useRestoreIslem();

  if (isLoading) return <LoadingSpinner />;

  if (!islemler?.length) {
    return (
      <EmptyState
        icon="trash-2"
        message={t('auditLog.empty.deleted')}
      />
    );
  }

  return (
    <View style={styles.list}>
      {islemler.map(islem => (
        <Card key={islem.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text variant="body">{islem.description}</Text>
            <Text variant="h3" color={islem.type.includes('gider') ? 'error' : 'success'}>
              {formatMoney(islem.amount)}
            </Text>
          </View>

          <View style={styles.cardMeta}>
            <UserAvatar userId={islem.deleted_by} size="sm" />
            <Text variant="caption" color="muted">
              {t('auditLog.deletedBy', { name: islem.deleter?.display_name })}
            </Text>
            <Text variant="caption" color="muted">
              {formatRelativeTime(islem.deleted_at)}
            </Text>
          </View>

          <Button
            variant="outline"
            size="sm"
            onPress={() => restoreIslem.mutate(islem.id)}
            loading={restoreIslem.isPending}
          >
            {t('auditLog.restore')}
          </Button>
        </Card>
      ))}
    </View>
  );
}

function EditedTransactionsList() {
  const { t } = useTranslation('multiUser');
  const { data: islemler, isLoading } = useEditedIslemler();

  if (isLoading) return <LoadingSpinner />;

  if (!islemler?.length) {
    return (
      <EmptyState
        icon="edit-3"
        message={t('auditLog.empty.edited')}
      />
    );
  }

  return (
    <View style={styles.list}>
      {islemler.map(islem => (
        <Card key={islem.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text variant="body">{islem.description}</Text>
            <Text variant="h3">
              {formatMoney(islem.amount)}
            </Text>
          </View>

          <View style={styles.cardMeta}>
            <UserAvatar userId={islem.updated_by} size="sm" />
            <Text variant="caption" color="muted">
              {t('auditLog.editedBy', { name: islem.editor?.display_name })}
            </Text>
            <Text variant="caption" color="muted">
              {formatRelativeTime(islem.updated_at)}
            </Text>
          </View>

          {/* Orijinal oluşturan farklıysa göster */}
          {islem.created_by !== islem.updated_by && (
            <View style={styles.cardMeta}>
              <UserAvatar userId={islem.created_by} size="sm" />
              <Text variant="caption" color="muted">
                {t('auditLog.createdBy', { name: islem.creator?.display_name })}
              </Text>
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  tabActive: {
    backgroundColor: colors.primaryLight,
  },
  warningBanner: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
```

### useAuditLog Hook

> **v6 DEĞİŞİKLİĞİ:** Soft delete kaldırıldı, `islem_audit_log` tablosu kullanılıyor.

```typescript
// src/hooks/useAuditLog.ts

// Silinen işlemler (audit log'dan)
export function useDeletedIslemler() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.deleted(isletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('islem_audit_log')
        .select(`
          *,
          performer:profiles!performed_by(*)
        `)
        .eq('isletme_id', isletme!.id)
        .eq('action', 'delete')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    enabled: !!isletme,
  });
}

// Düzenlenen işlemler (audit log'dan)
export function useEditedIslemler() {
  const { isletme } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.auditLog.edited(isletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('islem_audit_log')
        .select(`
          *,
          performer:profiles!performed_by(*)
        `)
        .eq('isletme_id', isletme!.id)
        .eq('action', 'update')
        .order('created_at', { ascending: false })
        .limit(100);

      // NOT: Eski plandaki .neq('updated_by', supabase.rpc(...)) kaldırıldı
      // Supabase JS client'ta .neq() parametresi olarak .rpc() kullanılamaz (Promise döner, crash eder)
      // Artık islem_audit_log tablosu kullanıldığı için bu sorun ortadan kalktı

      if (error) throw error;
      return data;
    },
    enabled: !!isletme,
  });
}

// İşlem yeniden oluşturma (eski restore yerine)
// Silinen işlemi audit log'daki old_data'dan yeniden oluşturur
export function useRecreateIslem() {
  const queryClient = useQueryClient();
  const createIslem = useCreateIslem();

  return useMutation({
    mutationFn: async (auditLogId: string) => {
      // Audit log kaydını al
      const { data: logEntry, error: logError } = await supabase
        .from('islem_audit_log')
        .select('*')
        .eq('id', auditLogId)
        .single();

      if (logError) throw logError;
      if (!logEntry?.old_data) throw new Error('İşlem verisi bulunamadı');

      // old_data'dan yeni işlem oluştur (id ve timestamps hariç)
      const { id, created_at, updated_at, created_by, updated_by, ...islemData } = logEntry.old_data;
      return createIslem.mutateAsync(islemData);
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'islem');
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
    },
  });
}
```

### queryKeys Eklentisi

```typescript
// src/lib/queryKeys.ts - auditLog eklentisi

export const queryKeys = {
  // ... mevcut keys ...

  auditLog: {
    all: () => ['audit-log'] as const,
    deleted: (isletmeId: string) => ['audit-log', 'deleted', isletmeId] as const,
    edited: (isletmeId: string) => ['audit-log', 'edited', isletmeId] as const,
  },
} as const;
```

### i18n Eklentileri

```json
// src/i18n/locales/tr/multiUser.json - auditLog eklentisi

{
  "auditLog": {
    "title": "İşlem Geçmişi",
    "tabs": {
      "deleted": "Silinenler",
      "edited": "Düzenlenenler"
    },
    "deletedBy": "Silen: {{name}}",
    "editedBy": "Düzenleyen: {{name}}",
    "createdBy": "Oluşturan: {{name}}",
    "recreate": "Yeniden Oluştur",
    "recreateConfirm": "Bu işlemi yeniden oluşturmak istediğinize emin misiniz?",
    "recreateSuccess": "İşlem yeniden oluşturuldu",
    "empty": {
      "deleted": "Silinen işlem yok",
      "edited": "Düzenlenen işlem yok"
    }
  }
}
```

```json
// src/i18n/locales/en/multiUser.json - auditLog eklentisi

{
  "auditLog": {
    "title": "Transaction History",
    "tabs": {
      "deleted": "Deleted",
      "edited": "Edited"
    },
    "deletedBy": "Deleted by: {{name}}",
    "editedBy": "Edited by: {{name}}",
    "createdBy": "Created by: {{name}}",
    "recreate": "Recreate",
    "recreateConfirm": "Are you sure you want to recreate this transaction?",
    "recreateSuccess": "Transaction recreated",
    "empty": {
      "deleted": "No deleted transactions",
      "edited": "No edited transactions"
    }
  }
}
```

---

## Veritabanı Şeması

### 1. profiles Tablosu

```sql
-- =============================================
-- PROFILES TABLOSU
-- =============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_email ON profiles(email);

-- updated_at trigger (mevcut fonksiyonu kullan)
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTION: Aynı işletmede mi?
-- =============================================

CREATE OR REPLACE FUNCTION users_share_isletme(p_viewer UUID, p_target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    -- Viewer owner, target shared user
    EXISTS (
      SELECT 1 FROM isletme_users iu
      JOIN isletmeler i ON i.id = iu.isletme_id
      WHERE i.user_id = p_viewer
        AND iu.user_id = p_target
        AND iu.status = 'active'
    )
    OR
    -- Viewer shared user, target owner
    EXISTS (
      SELECT 1 FROM isletme_users iu
      JOIN isletmeler i ON i.id = iu.isletme_id
      WHERE iu.user_id = p_viewer
        AND iu.status = 'active'
        AND i.user_id = p_target
    )
    OR
    -- Both shared users in same isletme
    EXISTS (
      SELECT 1 FROM isletme_users iu1
      JOIN isletme_users iu2 ON iu1.isletme_id = iu2.isletme_id
      WHERE iu1.user_id = p_viewer
        AND iu2.user_id = p_target
        AND iu1.status = 'active'
        AND iu2.status = 'active'
    );
$$;

-- =============================================
-- PROFILES RLS (Tek SELECT policy - sadeleştirilmiş)
-- =============================================

CREATE POLICY "View profiles" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid()
    OR users_share_isletme(auth.uid(), id)
  );

CREATE POLICY "Update own profile" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());

-- =============================================
-- TRIGGER: Yeni kullanıcı -> profiles
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

### 2. isletme_invites Tablosu

```sql
-- =============================================
-- ISLETME_INVITES TABLOSU (Davetler - Ayrı Tablo)
-- =============================================

CREATE TABLE isletme_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invite_code CHAR(6) NOT NULL UNIQUE,
  invited_email TEXT, -- Opsiyonel: kime gönderildi
  role TEXT NOT NULL CHECK (role IN ('manager', 'operator', 'purchaser', 'custom')),
  role_label TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_invites_code ON isletme_invites(invite_code) WHERE status = 'pending';
CREATE INDEX idx_invites_isletme ON isletme_invites(isletme_id);
CREATE INDEX idx_invites_status ON isletme_invites(isletme_id, status);

ALTER TABLE isletme_invites ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ISLETME_INVITES RLS (Sadece owner)
-- =============================================

-- SELECT: Sadece owner görebilir
CREATE POLICY "View invites" ON isletme_invites FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- INSERT: Sadece owner oluşturabilir
CREATE POLICY "Create invites" ON isletme_invites FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );

-- UPDATE: Sadece owner + sadece pending iken
CREATE POLICY "Update invites" ON isletme_invites FOR UPDATE
  TO authenticated
  USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  )
  WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    AND status = 'pending' -- Sadece pending iken değiştirilebilir
  );

-- DELETE: Sadece owner
CREATE POLICY "Delete invites" ON isletme_invites FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
  );
```

### 3. isletme_users Tablosu

```sql
-- =============================================
-- ISLETME_USERS TABLOSU (Sadece Shared Users - Owner YOK)
-- =============================================

CREATE TABLE isletme_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_id UUID REFERENCES isletme_invites(id),

  -- Rol (owner YOK - isletmeler.user_id'de)
  role TEXT NOT NULL CHECK (role IN ('manager', 'operator', 'purchaser', 'custom')),
  role_label TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',

  -- Durum
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'removed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_user_per_isletme UNIQUE (isletme_id, user_id)
);

CREATE INDEX idx_isletme_users_isletme ON isletme_users(isletme_id);
CREATE INDEX idx_isletme_users_user ON isletme_users(user_id);
CREATE INDEX idx_isletme_users_active ON isletme_users(user_id, status) WHERE status = 'active';

-- updated_at trigger
CREATE TRIGGER update_isletme_users_updated_at
  BEFORE UPDATE ON isletme_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE isletme_users ENABLE ROW LEVEL SECURITY;

-- =============================================
-- ISLETME_USERS RLS
-- =============================================

-- SELECT: Owner veya aynı işletmedeki aktif üyeler
CREATE POLICY "View isletme users" ON isletme_users FOR SELECT
  TO authenticated USING (
    -- İşletme sahibi
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Aynı işletmede aktif üye
    isletme_id IN (
      SELECT isletme_id FROM isletme_users
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: Yok (sadece RPC üzerinden)
-- RPC'ler SECURITY DEFINER olduğu için RLS'i bypass eder
```

### 4. role_templates Tablosu

```sql
-- =============================================
-- ROLE_TEMPLATES TABLOSU
-- =============================================

CREATE TABLE role_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  label_tr TEXT NOT NULL,
  label_en TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  default_permissions JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE role_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read" ON role_templates FOR SELECT
  TO authenticated USING (true);

-- =============================================
-- VARSAYILAN ROL ŞABLONLARI
-- =============================================

INSERT INTO role_templates (name, label_tr, label_en, sort_order, default_permissions) VALUES
('manager', 'Yönetici', 'Manager', 1, '{
  "modules": {
    "dashboard": true,
    "hesaplar": true,
    "cariler": true,
    "personel": true,
    "islemler": true,
    "kategoriler": true,
    "raporlar": true,
    "cekler": true,
    "nakit_avans": true,
    "ileri_tarihli": true,
    "urunler": true,
    "arsiv": true,
    "ayarlar": false
  },
  "actions": {
    "hesaplar": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "cariler": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "personel": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "islemler": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "kategoriler": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "cekler": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "nakit_avans": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": true, "can_delete_all": false},
    "ileri_tarihli": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false},
    "urunler": {"can_create": true, "can_update_own": true, "can_update_all": true, "can_delete_own": true, "can_delete_all": false}
  },
  "visibility": {
    "can_see_passive": true,
    "can_see_archived": true,
    "can_see_all_users_data": true
  },
  "restrictions": {}
}'),

('operator', 'Operatör', 'Operator', 2, '{
  "modules": {
    "dashboard": false,
    "hesaplar": true,
    "cariler": true,
    "personel": false,
    "islemler": true,
    "kategoriler": false,
    "raporlar": false,
    "cekler": false,
    "nakit_avans": false,
    "ileri_tarihli": false,
    "urunler": false,
    "arsiv": false,
    "ayarlar": false
  },
  "actions": {
    "hesaplar": {"can_create": false, "can_update_own": false, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "cariler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "islemler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false}
  },
  "visibility": {
    "can_see_passive": false,
    "can_see_archived": false,
    "can_see_all_users_data": false
  },
  "restrictions": {
    "islem_types": ["gelir", "gider", "cari_satis", "cari_tahsilat"]
  }
}'),

('purchaser', 'Satın Almacı', 'Purchaser', 3, '{
  "modules": {
    "dashboard": false,
    "hesaplar": true,
    "cariler": true,
    "personel": false,
    "islemler": true,
    "kategoriler": false,
    "raporlar": true,
    "cekler": true,
    "nakit_avans": false,
    "ileri_tarihli": true,
    "urunler": true,
    "arsiv": false,
    "ayarlar": false
  },
  "actions": {
    "hesaplar": {"can_create": false, "can_update_own": false, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "cariler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "islemler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "cekler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "ileri_tarihli": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false},
    "urunler": {"can_create": true, "can_update_own": true, "can_update_all": false, "can_delete_own": false, "can_delete_all": false}
  },
  "visibility": {
    "can_see_passive": false,
    "can_see_archived": false,
    "can_see_all_users_data": true
  },
  "restrictions": {
    "cari_types": ["tedarikci"],
    "islem_types": ["cari_alis", "cari_odeme", "cari_alis_iade"]
  }
}'),

('custom', 'Özel', 'Custom', 99, '{}');
```

### 5. created_by/updated_by Alanları ve Trigger

```sql
-- =============================================
-- CREATED_BY / UPDATED_BY ALANLARI
-- =============================================

ALTER TABLE islemler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE islemler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE hesaplar ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE hesaplar ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE cariler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE cariler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE personel ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE personel ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE kategoriler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE kategoriler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE cekler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE cekler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE ileri_tarihli_islemler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE ileri_tarihli_islemler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE nakit_avanslar ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE nakit_avanslar ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE urunler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE urunler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

ALTER TABLE urun_hareketler ADD COLUMN created_by UUID REFERENCES auth.users(id);
ALTER TABLE urun_hareketler ADD COLUMN updated_by UUID REFERENCES auth.users(id);

-- Indexler (sık sorgulananlar için)
CREATE INDEX idx_islemler_created_by ON islemler(created_by);
CREATE INDEX idx_cariler_created_by ON cariler(created_by);
CREATE INDEX idx_personel_created_by ON personel(created_by);

-- =============================================
-- AUDIT TRIGGER (SECURITY DEFINER - NULL-safe)
-- =============================================

CREATE OR REPLACE FUNCTION set_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- created_by: varsa kullan, yoksa auth.uid()
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    -- updated_by: auth.uid() yoksa created_by kullan
    NEW.updated_by := COALESCE(auth.uid(), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    -- updated_by: auth.uid() yoksa eski değeri koru
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
    -- created_by asla değişmez
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger'ları ekle
CREATE TRIGGER set_audit_islemler
  BEFORE INSERT OR UPDATE ON islemler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_hesaplar
  BEFORE INSERT OR UPDATE ON hesaplar
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_cariler
  BEFORE INSERT OR UPDATE ON cariler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_personel
  BEFORE INSERT OR UPDATE ON personel
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_kategoriler
  BEFORE INSERT OR UPDATE ON kategoriler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_cekler
  BEFORE INSERT OR UPDATE ON cekler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_ileri_tarihli
  BEFORE INSERT OR UPDATE ON ileri_tarihli_islemler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_nakit_avanslar
  BEFORE INSERT OR UPDATE ON nakit_avanslar
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_urunler
  BEFORE INSERT OR UPDATE ON urunler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();

CREATE TRIGGER set_audit_urun_hareketler
  BEFORE INSERT OR UPDATE ON urun_hareketler
  FOR EACH ROW EXECUTE FUNCTION set_audit_fields();
```

### 6. Geçmiş Kayıtları Sahibe Atama

```sql
-- =============================================
-- GEÇMİŞ KAYITLARI SAHİBE ATA
-- =============================================

UPDATE islemler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = islemler.isletme_id
) WHERE created_by IS NULL;

UPDATE hesaplar SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = hesaplar.isletme_id
) WHERE created_by IS NULL;

UPDATE cariler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = cariler.isletme_id
) WHERE created_by IS NULL;

UPDATE personel SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = personel.isletme_id
) WHERE created_by IS NULL;

UPDATE kategoriler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = kategoriler.isletme_id
) WHERE created_by IS NULL;

UPDATE cekler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = cekler.isletme_id
) WHERE created_by IS NULL;

UPDATE ileri_tarihli_islemler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = ileri_tarihli_islemler.isletme_id
) WHERE created_by IS NULL;

UPDATE nakit_avanslar SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = nakit_avanslar.isletme_id
) WHERE created_by IS NULL;

UPDATE urunler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = urunler.isletme_id
) WHERE created_by IS NULL;

UPDATE urun_hareketler SET created_by = (
  SELECT user_id FROM isletmeler WHERE id = urun_hareketler.isletme_id
) WHERE created_by IS NULL;

-- v7: updated_by'yi de doldur (audit/rapor/UX tutarlılığı için)
UPDATE islemler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE hesaplar SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cariler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE personel SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE kategoriler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE cekler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE ileri_tarihli_islemler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE nakit_avanslar SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE urunler SET updated_by = created_by WHERE updated_by IS NULL;
UPDATE urun_hareketler SET updated_by = created_by WHERE updated_by IS NULL;

-- =============================================
-- MEVCUT KULLANICILAR İÇİN PROFILES OLUŞTUR
-- =============================================

INSERT INTO profiles (id, email, display_name)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;
```

### 7. Helper Functions

```sql
-- =============================================
-- HELPER FUNCTION: İşletme erişim kontrolü
-- =============================================

CREATE OR REPLACE FUNCTION user_has_isletme_access(p_isletme_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    -- Kendi işletmesi (owner)
    SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()
  ) OR EXISTS (
    -- Paylaşılan işletme
    SELECT 1 FROM isletme_users
    WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

-- =============================================
-- HELPER FUNCTION: Kullanıcı yetkileri
-- =============================================

CREATE OR REPLACE FUNCTION get_user_permissions(p_isletme_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  -- Owner mı?
  IF EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RETURN '{"is_owner": true}'::jsonb;
  END IF;

  -- Shared user
  SELECT permissions INTO v_permissions
  FROM isletme_users
  WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active';

  IF v_permissions IS NULL THEN
    RETURN NULL; -- Erişim yok
  END IF;

  RETURN jsonb_build_object('is_owner', false, 'permissions', v_permissions);
END;
$$;

-- =============================================
-- HELPER FUNCTION: Pasif/arşiv görünürlük kontrolü
-- =============================================

CREATE OR REPLACE FUNCTION user_can_see_record(
  p_isletme_id UUID,
  p_is_archived BOOLEAN DEFAULT false,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_permissions JSONB;
BEGIN
  -- Owner her şeyi görebilir
  IF EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;

  -- Shared user yetkilerini al
  SELECT permissions INTO v_permissions
  FROM isletme_users
  WHERE isletme_id = p_isletme_id AND user_id = auth.uid() AND status = 'active';

  IF v_permissions IS NULL THEN
    RETURN FALSE; -- Erişim yok
  END IF;

  -- Arşivlenmiş kayıt kontrolü
  IF p_is_archived = true AND NOT COALESCE((v_permissions->'visibility'->>'can_see_archived')::boolean, false) THEN
    RETURN FALSE;
  END IF;

  -- Pasif kayıt kontrolü
  IF p_is_active = false AND NOT COALESCE((v_permissions->'visibility'->>'can_see_passive')::boolean, false) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;
```

### 8. RLS Politikalarını Güncelleme

```sql
-- =============================================
-- ISLEMLER RLS (Pasif/arşiv kolonu yok)
-- =============================================

DROP POLICY IF EXISTS "Users can manage islemler" ON islemler;

-- SELECT
CREATE POLICY "Select islemler" ON islemler FOR SELECT
  TO authenticated USING (
    -- Owner: her şeyi görebilir
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Shared user: modül erişimi + veri erişimi
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = islemler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false) = true
        AND (
          COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) = true
          OR islemler.created_by = auth.uid()
        )
    )
  );

-- INSERT
CREATE POLICY "Insert islemler" ON islemler FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = islemler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'islemler'->>'can_create')::boolean, false) = true
    )
  );

-- UPDATE
CREATE POLICY "Update islemler" ON islemler FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = islemler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'islemler'->>'can_update_own')::boolean, false) = true
            AND islemler.created_by = auth.uid()
          )
        )
    )
  );

-- DELETE
CREATE POLICY "Delete islemler" ON islemler FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = islemler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'islemler'->>'can_delete_own')::boolean, false) = true
            AND islemler.created_by = auth.uid()
          )
        )
    )
  );

-- =============================================
-- CARILER RLS (Pasif/arşiv kontrolü ile - fonksiyon kullanarak)
-- =============================================

DROP POLICY IF EXISTS "Users can manage cariler" ON cariler;

-- SELECT (user_can_see_record fonksiyonu ile)
CREATE POLICY "Select cariler" ON cariler FOR SELECT
  TO authenticated USING (
    -- Owner: her şeyi görebilir
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    -- Shared user: modül + veri + pasif/arşiv kontrolü
    (
      EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = cariler.isletme_id
          AND iu.user_id = auth.uid()
          AND iu.status = 'active'
          AND COALESCE((iu.permissions->'modules'->>'cariler')::boolean, false) = true
          AND (
            COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) = true
            OR cariler.created_by = auth.uid()
          )
      )
      AND user_can_see_record(cariler.isletme_id, cariler.is_archived, cariler.is_active)
    )
  );

-- INSERT
CREATE POLICY "Insert cariler" ON cariler FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cariler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'cariler'->>'can_create')::boolean, false) = true
    )
  );

-- UPDATE
CREATE POLICY "Update cariler" ON cariler FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cariler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'cariler'->>'can_update_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'cariler'->>'can_update_own')::boolean, false) = true
            AND cariler.created_by = auth.uid()
          )
        )
    )
  );

-- DELETE
CREATE POLICY "Delete cariler" ON cariler FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cariler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'cariler'->>'can_delete_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'cariler'->>'can_delete_own')::boolean, false) = true
            AND cariler.created_by = auth.uid()
          )
        )
    )
  );

-- =============================================
-- HESAPLAR RLS (Pasif/arşiv kontrolü ile)
-- =============================================

DROP POLICY IF EXISTS "Users can manage hesaplar" ON hesaplar;

CREATE POLICY "Select hesaplar" ON hesaplar FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    (
      EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = hesaplar.isletme_id
          AND iu.user_id = auth.uid()
          AND iu.status = 'active'
          AND COALESCE((iu.permissions->'modules'->>'hesaplar')::boolean, false) = true
      )
      AND user_can_see_record(hesaplar.isletme_id, hesaplar.is_archived, hesaplar.is_active)
    )
  );

CREATE POLICY "Insert hesaplar" ON hesaplar FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = hesaplar.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_create')::boolean, false) = true
    )
  );

CREATE POLICY "Update hesaplar" ON hesaplar FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = hesaplar.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_update_own')::boolean, false) = true
            AND hesaplar.created_by = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Delete hesaplar" ON hesaplar FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = hesaplar.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'hesaplar'->>'can_delete_own')::boolean, false) = true
            AND hesaplar.created_by = auth.uid()
          )
        )
    )
  );

-- =============================================
-- PERSONEL RLS (Pasif/arşiv kontrolü ile)
-- =============================================

DROP POLICY IF EXISTS "Users can manage personel" ON personel;

CREATE POLICY "Select personel" ON personel FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    (
      EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = personel.isletme_id
          AND iu.user_id = auth.uid()
          AND iu.status = 'active'
          AND COALESCE((iu.permissions->'modules'->>'personel')::boolean, false) = true
          AND (
            COALESCE((iu.permissions->'visibility'->>'can_see_all_users_data')::boolean, false) = true
            OR personel.created_by = auth.uid()
          )
      )
      AND user_can_see_record(personel.isletme_id, personel.is_archived, personel.is_active)
    )
  );

CREATE POLICY "Insert personel" ON personel FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = personel.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'personel'->>'can_create')::boolean, false) = true
    )
  );

CREATE POLICY "Update personel" ON personel FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = personel.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'personel'->>'can_update_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'personel'->>'can_update_own')::boolean, false) = true
            AND personel.created_by = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Delete personel" ON personel FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = personel.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'personel'->>'can_delete_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'personel'->>'can_delete_own')::boolean, false) = true
            AND personel.created_by = auth.uid()
          )
        )
    )
  );

-- =============================================
-- KATEGORILER RLS (Pasif kontrolü ile, arşiv yok)
-- =============================================

DROP POLICY IF EXISTS "Users can manage kategoriler" ON kategoriler;

CREATE POLICY "Select kategoriler" ON kategoriler FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    (
      EXISTS (
        SELECT 1 FROM isletme_users iu
        WHERE iu.isletme_id = kategoriler.isletme_id
          AND iu.user_id = auth.uid()
          AND iu.status = 'active'
          AND COALESCE((iu.permissions->'modules'->>'kategoriler')::boolean, false) = true
      )
      AND user_can_see_record(kategoriler.isletme_id, false, kategoriler.is_active)
    )
  );

CREATE POLICY "Insert kategoriler" ON kategoriler FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = kategoriler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_create')::boolean, false) = true
    )
  );

CREATE POLICY "Update kategoriler" ON kategoriler FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = kategoriler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_update_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_update_own')::boolean, false) = true
            AND kategoriler.created_by = auth.uid()
          )
        )
    )
  );

CREATE POLICY "Delete kategoriler" ON kategoriler FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = kategoriler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_delete_all')::boolean, false) = true
          OR (
            COALESCE((iu.permissions->'actions'->'kategoriler'->>'can_delete_own')::boolean, false) = true
            AND kategoriler.created_by = auth.uid()
          )
        )
    )
  );

-- =============================================
-- İŞLETMELER RLS GÜNCELLEMESİ (v6: Shared user erişimi)
-- =============================================
-- KRITIK: Mevcut policy sadece owner'a SELECT izni veriyor.
-- Shared user'lar isletme verisini yükleyemez -> uygulama çalışmaz.

DROP POLICY IF EXISTS "Users can manage isletmeler" ON isletmeler;

-- SELECT: Owner VEYA aktif shared user
CREATE POLICY "Users can view isletmeler" ON isletmeler FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = isletmeler.id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
    )
  );

-- INSERT/UPDATE/DELETE: Sadece owner
CREATE POLICY "Owner can manage isletmeler" ON isletmeler
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- CEKLER RLS (v6: Eksik olan tablo)
-- =============================================

DROP POLICY IF EXISTS "Users can manage cekler" ON cekler;

CREATE POLICY "Select cekler" ON cekler FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cekler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'cekler')::boolean, false) = true
    )
  );

CREATE POLICY "Insert cekler" ON cekler FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cekler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'cekler'->>'can_create')::boolean, false) = true
    )
  );

CREATE POLICY "Update cekler" ON cekler FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cekler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'cekler'->>'can_update_all')::boolean, false) = true
          OR (COALESCE((iu.permissions->'actions'->'cekler'->>'can_update_own')::boolean, false) = true AND cekler.created_by = auth.uid())
        )
    )
  );

CREATE POLICY "Delete cekler" ON cekler FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = cekler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'cekler'->>'can_delete_all')::boolean, false) = true
          OR (COALESCE((iu.permissions->'actions'->'cekler'->>'can_delete_own')::boolean, false) = true AND cekler.created_by = auth.uid())
        )
    )
  );

-- =============================================
-- NAKİT_AVANSLAR RLS (v6: Eksik olan tablo)
-- =============================================

DROP POLICY IF EXISTS "Users can manage nakit_avanslar" ON nakit_avanslar;

CREATE POLICY "Manage nakit_avanslar" ON nakit_avanslar FOR ALL
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = nakit_avanslar.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'nakit_avans')::boolean, false) = true
    )
  );

-- =============================================
-- İLERİ_TARİHLİ_İŞLEMLER RLS (v6: Eksik olan tablo)
-- =============================================

DROP POLICY IF EXISTS "Users can manage ileri_tarihli_islemler" ON ileri_tarihli_islemler;

CREATE POLICY "Manage ileri_tarihli_islemler" ON ileri_tarihli_islemler FOR ALL
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = ileri_tarihli_islemler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'ileri_tarihli')::boolean, false) = true
    )
  );

-- =============================================
-- URUNLER RLS (v6: Tamamen yeni eklenen tablo)
-- =============================================

DROP POLICY IF EXISTS "Users can manage urunler" ON urunler;

CREATE POLICY "Select urunler" ON urunler FOR SELECT
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = urunler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false) = true
    )
  );

CREATE POLICY "Insert urunler" ON urunler FOR INSERT
  TO authenticated WITH CHECK (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = urunler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'actions'->'urunler'->>'can_create')::boolean, false) = true
    )
  );

CREATE POLICY "Update urunler" ON urunler FOR UPDATE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = urunler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_all')::boolean, false) = true
          OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_update_own')::boolean, false) = true AND urunler.created_by = auth.uid())
        )
    )
  );

CREATE POLICY "Delete urunler" ON urunler FOR DELETE
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = urunler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND (
          COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_all')::boolean, false) = true
          OR (COALESCE((iu.permissions->'actions'->'urunler'->>'can_delete_own')::boolean, false) = true AND urunler.created_by = auth.uid())
        )
    )
  );

-- =============================================
-- URUN_HAREKETLER RLS (v6: Tamamen yeni eklenen tablo)
-- =============================================

DROP POLICY IF EXISTS "Users can manage urun_hareketler" ON urun_hareketler;

CREATE POLICY "Manage urun_hareketler" ON urun_hareketler FOR ALL
  TO authenticated USING (
    isletme_id IN (SELECT id FROM isletmeler WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id = urun_hareketler.isletme_id
        AND iu.user_id = auth.uid()
        AND iu.status = 'active'
        AND COALESCE((iu.permissions->'modules'->>'urunler')::boolean, false) = true
    )
  );
```

---

## RPC Fonksiyonları

### Davet Oluşturma (Sadece Owner)

```sql
CREATE OR REPLACE FUNCTION create_isletme_invite(
  p_isletme_id UUID,
  p_role TEXT,
  p_role_label TEXT DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL,
  p_invited_email TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_default_permissions JSONB;
BEGIN
  -- Sadece owner
  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi davet oluşturabilir';
  END IF;

  -- Rate limit: saatte 10 davet
  IF (
    SELECT COUNT(*) FROM isletme_invites
    WHERE isletme_id = p_isletme_id
      AND created_at > NOW() - INTERVAL '1 hour'
      AND status = 'pending'
  ) >= 10 THEN
    RAISE EXCEPTION 'Çok fazla davet oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.';
  END IF;

  -- Varsayılan yetkiler
  IF p_permissions IS NULL AND p_role != 'custom' THEN
    SELECT default_permissions INTO v_default_permissions
    FROM role_templates WHERE name = p_role;
    p_permissions := COALESCE(v_default_permissions, '{}');
  END IF;

  -- Benzersiz kod oluştur
  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    v_code := translate(v_code, '0O1IL', 'XYZAB');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM isletme_invites WHERE invite_code = v_code AND status = 'pending'
    );
  END LOOP;

  -- Davet kaydı
  INSERT INTO isletme_invites (
    isletme_id, invited_by, invite_code, invited_email,
    role, role_label, permissions
  ) VALUES (
    p_isletme_id, auth.uid(), v_code, p_invited_email,
    p_role, p_role_label, COALESCE(p_permissions, '{}')
  );

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION create_isletme_invite TO authenticated;
```

### Daveti Kabul Etme

```sql
CREATE OR REPLACE FUNCTION accept_isletme_invite(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Daveti bul ve kilitle (race condition önleme)
  SELECT * INTO v_invite
  FROM isletme_invites
  WHERE invite_code = upper(p_code)
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Geçersiz veya süresi dolmuş davet kodu';
  END IF;

  -- Kullanıcı zaten bu işletmede mi?
  IF EXISTS (
    SELECT 1 FROM isletme_users
    WHERE isletme_id = v_invite.isletme_id
      AND user_id = auth.uid()
      AND status IN ('active', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Bu işletmeye zaten erişiminiz var';
  END IF;

  -- Kullanıcı işletme sahibi mi?
  IF EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = v_invite.isletme_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Kendi işletmenize davet kabul edemezsiniz';
  END IF;

  -- Daveti güncelle
  UPDATE isletme_invites
  SET status = 'accepted',
      accepted_at = NOW(),
      accepted_by = auth.uid()
  WHERE id = v_invite.id;

  -- Kullanıcıyı ekle
  INSERT INTO isletme_users (
    isletme_id, user_id, invite_id,
    role, role_label, permissions
  ) VALUES (
    v_invite.isletme_id, auth.uid(), v_invite.id,
    v_invite.role, v_invite.role_label, v_invite.permissions
  );

  RETURN v_invite.isletme_id;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_isletme_invite TO authenticated;
```

### Daveti İptal Etme

```sql
CREATE OR REPLACE FUNCTION cancel_isletme_invite(p_invite_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite RECORD;
BEGIN
  -- Daveti bul
  SELECT * INTO v_invite FROM isletme_invites WHERE id = p_invite_id;

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Davet bulunamadı';
  END IF;

  -- Sadece owner
  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = v_invite.isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi daveti iptal edebilir';
  END IF;

  -- Sadece pending iken iptal edilebilir
  IF v_invite.status != 'pending' THEN
    RAISE EXCEPTION 'Sadece bekleyen davetler iptal edilebilir';
  END IF;

  UPDATE isletme_invites SET status = 'cancelled' WHERE id = p_invite_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_isletme_invite TO authenticated;
```

### Kullanıcı Yetkilerini Güncelleme (Sadece Owner)

```sql
CREATE OR REPLACE FUNCTION update_isletme_user(
  p_user_id UUID,
  p_isletme_id UUID,
  p_role TEXT DEFAULT NULL,
  p_role_label TEXT DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sadece owner
  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi kullanıcı düzenleyebilir';
  END IF;

  -- Hedef kullanıcı var mı?
  IF NOT EXISTS (SELECT 1 FROM isletme_users WHERE isletme_id = p_isletme_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı';
  END IF;

  -- Güncelle
  UPDATE isletme_users
  SET
    role = COALESCE(p_role, role),
    role_label = COALESCE(p_role_label, role_label),
    permissions = COALESCE(p_permissions, permissions),
    status = COALESCE(p_status, status),
    updated_at = NOW()
  WHERE isletme_id = p_isletme_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION update_isletme_user TO authenticated;
```

### Kullanıcıyı Kaldırma (Soft Delete)

```sql
CREATE OR REPLACE FUNCTION remove_isletme_user(
  p_user_id UUID,
  p_isletme_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sadece owner
  IF NOT EXISTS (SELECT 1 FROM isletmeler WHERE id = p_isletme_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sadece işletme sahibi kullanıcı kaldırabilir';
  END IF;

  -- Kendini kaldıramaz (zaten owner)
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Kendinizi kaldıramazsınız';
  END IF;

  UPDATE isletme_users
  SET status = 'removed', updated_at = NOW()
  WHERE isletme_id = p_isletme_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_isletme_user TO authenticated;
```

### 6. leave_isletme (v6 - YENİ)

> **v6 EKLENTİSİ:** Shared user'ın kendi isteğiyle işletmeden ayrılması için RPC. Plan UI'da "İşletmeden Ayrıl" butonu gösteriyor ama bu işlem için RPC eksikti.

```sql
-- =============================================
-- İŞLETMEDEN AYRILMA (Shared User)
-- =============================================
CREATE OR REPLACE FUNCTION leave_isletme(p_isletme_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner ayrılamaz (owner isletmeler.user_id ile tanımlı, isletme_users'ta kaydı yok)
  IF EXISTS (
    SELECT 1 FROM isletmeler
    WHERE id = p_isletme_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'İşletme sahibi işletmeden ayrılamaz';
  END IF;

  -- Kullanıcının kaydını kaldır
  DELETE FROM isletme_users
  WHERE isletme_id = p_isletme_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION leave_isletme TO authenticated;
```

---

## TypeScript Tipleri

```typescript
// src/types/multiUser.ts

export type UserRole = 'manager' | 'operator' | 'purchaser' | 'custom';
export type UserStatus = 'active' | 'suspended' | 'removed';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface Permissions {
  modules: {
    dashboard: boolean;
    hesaplar: boolean;
    cariler: boolean;
    personel: boolean;
    islemler: boolean;
    kategoriler: boolean;
    raporlar: boolean;
    cekler: boolean;
    nakit_avans: boolean;
    ileri_tarihli: boolean;
    urunler: boolean;  // v6: eklendi - urunler tab'ı aktif
    arsiv: boolean;
    ayarlar: boolean;
  };
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
```

---

## React Context ve Hooks

### AuthContext Genişletme (IsletmeContext DEĞİL)

> **ÖNEMLİ:** Yeni bir IsletmeContext oluşturmak yerine mevcut AuthContext'i genişletiyoruz. Bu sayede geriye uyumluluk korunur ve mevcut `useAuthContext()` çağrıları çalışmaya devam eder.

```typescript
// src/contexts/AuthContext.tsx - GÜNCELLENMİŞ

interface AuthContextType {
  // === MEVCUT ALANLAR (değişmez) ===
  session: Session | null;
  user: User | null;
  isletme: Isletme | null;  // Artık currentIsletme olarak da kullanılır
  loading: boolean;
  initialized: boolean;
  isletmeLoading: boolean;
  needsPasswordReset: boolean;
  signIn: (email: string, password: string) => Promise<{ user: User; session: Session }>;
  signUp: (email: string, password: string, isletmeName: string) => Promise<{ user: User; isletme: Isletme }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  cancelAccountDeletion: () => Promise<void>;
  refreshIsletme: () => Promise<void>;
  signInWithApple: () => Promise<any>;
  signInWithGoogle: (idToken: string) => Promise<any>;
  isAppleSignInAvailable: boolean;
  clearPasswordReset: () => void;

  // === YENİ ALANLAR (multi-user) ===
  ownIsletme: Isletme | null;           // Kullanıcının kendi işletmesi
  sharedIsletmeler: IsletmeUser[];      // Paylaşılan işletmeler
  isSharedMode: boolean;                // Paylaşılan modda mı?
  isOwner: boolean;                     // currentIsletme'nin sahibi mi?
  currentUserRole: UserRole | null;     // Shared modda rol
  currentPermissions: Permissions | null; // Shared modda yetkiler
  switchToIsletme: (isletmeId: string) => void;
  switchToOwnIsletme: () => void;
  multiUserLoading: boolean;            // Shared isletmeler yükleniyor
}
```

### usePermissions Hook

```typescript
// src/hooks/usePermissions.ts

export function usePermissions() {
  const { isOwner, currentPermissions, user } = useAuthContext();

  // Modül erişimi
  const canAccessModule = useCallback((module: keyof Permissions['modules']): boolean => {
    if (isOwner) return true;
    return currentPermissions?.modules?.[module] ?? false;
  }, [isOwner, currentPermissions]);

  // Oluşturma yetkisi
  const canCreate = useCallback((module: string): boolean => {
    if (isOwner) return true;
    return currentPermissions?.actions?.[module]?.can_create ?? false;
  }, [isOwner, currentPermissions]);

  // Güncelleme yetkisi
  const canUpdate = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const actions = currentPermissions?.actions?.[module];
    if (actions?.can_update_all) return true;
    if (actions?.can_update_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  // Silme yetkisi
  const canDelete = useCallback((module: string, createdBy: string | null): boolean => {
    if (isOwner) return true;
    const actions = currentPermissions?.actions?.[module];
    if (actions?.can_delete_all) return true;
    if (actions?.can_delete_own && createdBy === user?.id) return true;
    return false;
  }, [isOwner, currentPermissions, user]);

  return {
    isOwner,
    canAccessModule,
    canCreate,
    canUpdate,
    canDelete,
    canSeePassive: isOwner || (currentPermissions?.visibility?.can_see_passive ?? false),
    canSeeArchived: isOwner || (currentPermissions?.visibility?.can_see_archived ?? false),
    canSeeAllUsersData: isOwner || (currentPermissions?.visibility?.can_see_all_users_data ?? false),
    restrictions: currentPermissions?.restrictions,
  };
}
```

### useMultiUser Hook

```typescript
// src/hooks/useMultiUser.ts

// İşletme kullanıcıları
export function useIsletmeUsers() {
  const { isletme: currentIsletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.users(currentIsletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isletme_users')
        .select('*, profile:profiles(*)')
        .eq('isletme_id', currentIsletme!.id)
        .neq('status', 'removed');
      if (error) throw error;
      return data as IsletmeUser[];
    },
    enabled: !!currentIsletme && isOwner,
  });
}

// Davetler
export function useIsletmeInvites() {
  const { isletme: currentIsletme, isOwner } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.multiUser.invites(currentIsletme?.id ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('isletme_invites')
        .select('*')
        .eq('isletme_id', currentIsletme!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return data as IsletmeInvite[];
    },
    enabled: !!currentIsletme && isOwner,
  });
}

// Davet oluştur
export function useCreateInvite() {
  const { isletme: currentIsletme } = useAuthContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { role: UserRole; roleLabel?: string; permissions?: Permissions; email?: string }) => {
      const { data, error } = await supabase.rpc('create_isletme_invite', {
        p_isletme_id: currentIsletme!.id,
        p_role: params.role,
        p_role_label: params.roleLabel,
        p_permissions: params.permissions,
        p_invited_email: params.email,
      });
      if (error) throw error;
      return data as string; // invite_code
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Daveti kabul et
export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('accept_isletme_invite', { p_code: code });
      if (error) throw error;
      return data as string; // isletme_id
    },
    onSuccess: () => {
      invalidateRelatedQueries(queryClient, 'isletmeUser');
    },
  });
}

// Paylaşılan işletmeler
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

// Profil bilgisi
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
```

---

## UI Bileşenleri

### SharedIsletmeBanner (ArchivedBanner pattern'ine uyumlu)

> **Pattern Uyumu:** ArchivedBanner.tsx yapısı takip edildi - warningLight/warning renk şeması, container>content>icon+text yapısı.

```typescript
// src/components/ui/SharedIsletmeBanner.tsx

import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Building2, X } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { Text } from './Text';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from '@/contexts/AuthContext';

interface SharedIsletmeBannerProps {
  onExit?: () => void;
}

export function SharedIsletmeBanner({ onExit }: SharedIsletmeBannerProps) {
  const { t } = useTranslation('multiUser');
  const { isSharedMode, isletme, currentUserRole, switchToOwnIsletme } = useAuthContext();

  if (!isSharedMode) return null;

  const handleExit = () => {
    switchToOwnIsletme();
    onExit?.();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Building2 size={20} color={colors.info} style={styles.icon} />
        <View style={styles.textContainer}>
          <Text variant="label" numberOfLines={1}>
            {isletme?.name}
          </Text>
          <Text variant="caption" color="muted">
            {t(`roles.${currentUserRole}`)}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.exitButton}
        onPress={handleExit}
        activeOpacity={0.7}
      >
        <X size={16} color={colors.info} />
        <Text variant="label" color="primary">
          {t('banner.exit')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.info,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  exitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
});
```

### UserAvatar (İşlem sahibi)

```typescript
// src/components/UserAvatar.tsx

interface UserAvatarProps {
  userId: string | null;
  updatedBy?: string | null;
  size?: 'sm' | 'md';
}

export function UserAvatar({ userId, updatedBy, size = 'sm' }: UserAvatarProps) {
  const { data: profile } = useProfile(userId);
  const wasEdited = updatedBy && updatedBy !== userId;

  if (!userId) return null;

  const initials = profile?.display_name
    ? profile.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile?.email?.charAt(0).toUpperCase() ?? '?';

  return (
    <Tooltip content={`${profile?.display_name ?? profile?.email ?? 'Bilinmiyor'}${wasEdited ? ' (düzenlendi)' : ''}`}>
      <View style={[styles.avatar, styles[size]]}>
        <Text style={styles.initials}>{initials}</Text>
        {wasEdited && (
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={8} color="#fff" />
          </View>
        )}
      </View>
    </Tooltip>
  );
}
```

### PermissionGate (Yetki Wrapper Bileşeni)

> **YENİ:** Planın önceki versiyonunda eksik olan bileşen. Children'ları yetki kontrolü ile sarar.

```typescript
// src/components/PermissionGate.tsx

import { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import type { Permissions } from '@/types/multiUser';

type ModuleName = keyof Permissions['modules'];
type ActionType = 'create' | 'update' | 'delete';

interface PermissionGateProps {
  children: ReactNode;
  // Modül erişimi kontrolü
  module?: ModuleName;
  // Aksiyon kontrolü (module ile birlikte kullanılır)
  action?: ActionType;
  // Kaydın sahibi (update/delete kontrolü için)
  createdBy?: string | null;
  // Yetki yoksa gösterilecek fallback (varsayılan: null)
  fallback?: ReactNode;
  // Yetki yoksa mesaj göster (fallback yerine)
  showMessage?: boolean;
}

export function PermissionGate({
  children,
  module,
  action,
  createdBy,
  fallback = null,
  showMessage = false,
}: PermissionGateProps) {
  const { t } = useTranslation('multiUser');
  const { isOwner, canAccessModule, canCreate, canUpdate, canDelete } = usePermissions();

  // Owner her şeyi yapabilir
  if (isOwner) {
    return <>{children}</>;
  }

  // Modül erişimi kontrolü
  if (module && !canAccessModule(module)) {
    return showMessage ? <NoPermissionMessage message={t('permissions.noModuleAccess')} /> : fallback;
  }

  // Aksiyon kontrolü
  if (module && action) {
    let hasPermission = false;

    switch (action) {
      case 'create':
        hasPermission = canCreate(module);
        break;
      case 'update':
        hasPermission = canUpdate(module, createdBy ?? null);
        break;
      case 'delete':
        hasPermission = canDelete(module, createdBy ?? null);
        break;
    }

    if (!hasPermission) {
      return showMessage ? <NoPermissionMessage message={t('permissions.noActionAccess')} /> : fallback;
    }
  }

  return <>{children}</>;
}

function NoPermissionMessage({ message }: { message: string }) {
  return (
    <View style={styles.noPermission}>
      <Lock size={16} color={colors.textMuted} />
      <Text variant="caption" color="muted">{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  noPermission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
});
```

**Kullanım Örnekleri:**

```typescript
// Modül erişimi kontrolü
<PermissionGate module="personel">
  <PersonelListesi />
</PermissionGate>

// Oluşturma yetkisi kontrolü
<PermissionGate module="cariler" action="create" fallback={null}>
  <Button>Yeni Cari Ekle</Button>
</PermissionGate>

// Güncelleme yetkisi kontrolü (own vs all)
<PermissionGate module="islemler" action="update" createdBy={islem.created_by}>
  <Button>Düzenle</Button>
</PermissionGate>

// Yetki yoksa mesaj göster
<PermissionGate module="raporlar" showMessage>
  <RaporlarSayfasi />
</PermissionGate>
```

---

## queryKeys.ts Eklentileri

> **ÖNEMLİ:** Mevcut `src/lib/queryKeys.ts` dosyasına eklenecek.

```typescript
// src/lib/queryKeys.ts - EKLENTİLER

export const queryKeys = {
  // ... mevcut keys ...

  // Multi-User
  multiUser: {
    all: () => ['multi-user'] as const,
    users: (isletmeId: string) => ['isletme-users', isletmeId] as const,
    invites: (isletmeId: string) => ['isletme-invites', isletmeId] as const,
    sharedIsletmeler: (userId: string) => ['shared-isletmeler', userId] as const,
    roleTemplates: () => ['role-templates'] as const,
  },

  // Profiles
  profiles: {
    all: () => ['profiles'] as const,
    detail: (userId: string) => ['profile', userId] as const,
  },
} as const;

// invalidationMap - EKLENTİ
const invalidationMap = {
  // ... mevcut entries ...

  // İşletme kullanıcı değişikliği
  isletmeUser: [
    'isletme-users',
    'isletme-invites',
    'shared-isletmeler',
    'profile',
  ],
} as const;

// createInvalidators - EKLENTİ
export const createInvalidators = (queryClient: QueryClient) => ({
  // ... mevcut invalidators ...

  /**
   * İşletme kullanıcı mutation'ları için
   */
  onIsletmeUserMutation: () => invalidateRelatedQueries(queryClient, 'isletmeUser'),
});
```

---

## i18n Dosyaları (JSON Format)

> **ÖNEMLİ:** Proje `src/i18n/locales/` yapısı kullanıyor (constants/strings DEĞİL). Her dil için ayrı JSON dosyası oluşturulacak.

### 1. Türkçe Çeviri: `src/i18n/locales/tr/multiUser.json`

```json
{
  "roles": {
    "owner": "İşletme Sahibi",
    "manager": "Yönetici",
    "operator": "Operatör",
    "purchaser": "Satın Almacı",
    "custom": "Özel Rol"
  },
  "status": {
    "active": "Aktif",
    "suspended": "Askıya Alındı",
    "removed": "Kaldırıldı",
    "pending": "Bekliyor",
    "accepted": "Kabul Edildi",
    "expired": "Süresi Doldu",
    "cancelled": "İptal Edildi"
  },
  "banner": {
    "exit": "Çıkış",
    "viewingAs": "Görüntüleniyor:"
  },
  "permissions": {
    "noModuleAccess": "Bu modüle erişim yetkiniz yok",
    "noActionAccess": "Bu işlem için yetkiniz yok"
  },
  "users": {
    "title": "Kullanıcılar",
    "subtitle": "İşletmenize erişimi olan kullanıcıları yönetin",
    "empty": "Henüz kullanıcı eklenmemiş",
    "invite": "Kullanıcı Davet Et",
    "editRole": "Rolü Düzenle",
    "removeUser": "Kullanıcıyı Kaldır",
    "removeConfirm": "Bu kullanıcının erişimini kaldırmak istediğinize emin misiniz?",
    "suspendUser": "Askıya Al",
    "activateUser": "Aktifleştir"
  },
  "invites": {
    "title": "Davet Oluştur",
    "subtitle": "Yeni kullanıcı davet etmek için kod oluşturun",
    "selectRole": "Rol Seçin",
    "emailOptional": "E-posta (opsiyonel)",
    "emailPlaceholder": "kullanici@example.com",
    "generateCode": "Kod Oluştur",
    "codeGenerated": "Davet Kodu",
    "copyCode": "Kodu Kopyala",
    "codeCopied": "Kod kopyalandı!",
    "shareCode": "Bu kodu davet ettiğiniz kişiyle paylaşın",
    "codeExpiry": "Kod 7 gün geçerlidir",
    "pendingInvites": "Bekleyen Davetler",
    "cancelInvite": "Daveti İptal Et",
    "noInvites": "Bekleyen davet yok"
  },
  "shared": {
    "title": "Paylaşılan İşletmeler",
    "subtitle": "Size paylaşılan işletmeleri görüntüleyin",
    "empty": "Henüz paylaşılan işletme yok",
    "enterCode": "Davet Kodu Gir",
    "codePlaceholder": "ABC123",
    "acceptInvite": "Daveti Kabul Et",
    "switchTo": "Geçiş Yap",
    "leaveIsletme": "İşletmeden Ayrıl",
    "leaveConfirm": "Bu işletmeden ayrılmak istediğinize emin misiniz?"
  },
  "errors": {
    "invalidCode": "Geçersiz veya süresi dolmuş davet kodu",
    "alreadyMember": "Bu işletmeye zaten erişiminiz var",
    "cannotInviteSelf": "Kendi işletmenize davet kabul edemezsiniz",
    "rateLimitExceeded": "Çok fazla davet oluşturdunuz. Lütfen 1 saat sonra tekrar deneyin.",
    "userNotFound": "Kullanıcı bulunamadı"
  },
  "success": {
    "inviteAccepted": "Davet kabul edildi",
    "userRemoved": "Kullanıcı kaldırıldı",
    "roleUpdated": "Rol güncellendi",
    "inviteCancelled": "Davet iptal edildi",
    "leftIsletme": "İşletmeden ayrıldınız"
  }
}
```

### 2. İngilizce Çeviri: `src/i18n/locales/en/multiUser.json`

```json
{
  "roles": {
    "owner": "Owner",
    "manager": "Manager",
    "operator": "Operator",
    "purchaser": "Purchaser",
    "custom": "Custom Role"
  },
  "status": {
    "active": "Active",
    "suspended": "Suspended",
    "removed": "Removed",
    "pending": "Pending",
    "accepted": "Accepted",
    "expired": "Expired",
    "cancelled": "Cancelled"
  },
  "banner": {
    "exit": "Exit",
    "viewingAs": "Viewing as:"
  },
  "permissions": {
    "noModuleAccess": "You do not have access to this module",
    "noActionAccess": "You do not have permission for this action"
  },
  "users": {
    "title": "Users",
    "subtitle": "Manage users with access to your business",
    "empty": "No users added yet",
    "invite": "Invite User",
    "editRole": "Edit Role",
    "removeUser": "Remove User",
    "removeConfirm": "Are you sure you want to remove this user's access?",
    "suspendUser": "Suspend",
    "activateUser": "Activate"
  },
  "invites": {
    "title": "Create Invite",
    "subtitle": "Generate a code to invite new users",
    "selectRole": "Select Role",
    "emailOptional": "Email (optional)",
    "emailPlaceholder": "user@example.com",
    "generateCode": "Generate Code",
    "codeGenerated": "Invite Code",
    "copyCode": "Copy Code",
    "codeCopied": "Code copied!",
    "shareCode": "Share this code with the person you are inviting",
    "codeExpiry": "Code is valid for 7 days",
    "pendingInvites": "Pending Invites",
    "cancelInvite": "Cancel Invite",
    "noInvites": "No pending invites"
  },
  "shared": {
    "title": "Shared Businesses",
    "subtitle": "View businesses shared with you",
    "empty": "No shared businesses yet",
    "enterCode": "Enter Invite Code",
    "codePlaceholder": "ABC123",
    "acceptInvite": "Accept Invite",
    "switchTo": "Switch To",
    "leaveIsletme": "Leave Business",
    "leaveConfirm": "Are you sure you want to leave this business?"
  },
  "errors": {
    "invalidCode": "Invalid or expired invite code",
    "alreadyMember": "You already have access to this business",
    "cannotInviteSelf": "You cannot accept an invite to your own business",
    "rateLimitExceeded": "Too many invites created. Please try again in 1 hour.",
    "userNotFound": "User not found"
  },
  "success": {
    "inviteAccepted": "Invite accepted",
    "userRemoved": "User removed",
    "roleUpdated": "Role updated",
    "inviteCancelled": "Invite cancelled",
    "leftIsletme": "Left business"
  }
}
```

### 3. i18n/index.ts Güncellemesi

```typescript
// src/i18n/index.ts - EKLENTİLER

// Import Turkish locales - YENİ SATIR EKLE
import trMultiUser from './locales/tr/multiUser.json';

// Import English locales - YENİ SATIR EKLE
import enMultiUser from './locales/en/multiUser.json';

// Resource bundle - GÜNCELLE
export const resources = {
  tr: {
    // ... mevcut olanlar ...
    multiUser: trMultiUser,  // ← YENİ
  },
  en: {
    // ... mevcut olanlar ...
    multiUser: enMultiUser,  // ← YENİ
  },
} as const;

// Namespace list - GÜNCELLE
export const namespaces = [
  // ... mevcut olanlar ...
  'multiUser',  // ← YENİ
] as const;
```

### 4. Kullanım Örneği

```typescript
// Bileşende kullanım
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('multiUser');

  return (
    <Text>{t('users.title')}</Text>           // "Kullanıcılar" / "Users"
    <Text>{t('roles.manager')}</Text>          // "Yönetici" / "Manager"
    <Text>{t('errors.invalidCode')}</Text>     // "Geçersiz veya süresi..." / "Invalid or expired..."
  );
}
```

---

## Dosya Değişiklikleri Özeti (v5 Güncellenmiş)

### Yeni Dosyalar
| Dosya | Açıklama |
|-------|----------|
| `supabase/migrations/YYYYMMDD_multi_user.sql` | Ana migration |
| `src/hooks/usePermissions.ts` | Yetki hook |
| `src/hooks/useMultiUser.ts` | Multi-user hooks (useProfile dahil) |
| `src/hooks/useAuditLog.ts` | Silinen/düzenlenen işlemler hook **(v5)** |
| `src/types/multiUser.ts` | TypeScript tipleri |
| `src/app/ayarlar/kullanici-yonetimi.tsx` | Kullanıcı yönetimi **(kebab-case)** |
| `src/app/ayarlar/paylasilan-isletmeler.tsx` | Paylaşılan işletmeler |
| `src/app/ayarlar/davet-olustur.tsx` | Davet ekranı **(kebab-case)** |
| `src/app/ayarlar/islem-gecmisi.tsx` | Silinen/düzenlenen işlemler **(v5)** |
| `src/components/ui/SharedIsletmeBanner.tsx` | Banner (ui klasöründe) |
| `src/components/UserAvatar.tsx` | Avatar |
| `src/components/PermissionGate.tsx` | Yetki wrapper |
| `src/components/multiUser/UserEditSheet.tsx` | Kullanıcı düzenleme bottom sheet **(v5)** |
| `src/components/multiUser/PermissionEditor.tsx` | Yetki düzenleme formu **(v5)** |
| `src/components/multiUser/RoleSelector.tsx` | Rol seçici **(v5)** |
| `src/i18n/locales/tr/multiUser.json` | Türkçe çeviriler **(i18n JSON)** |
| `src/i18n/locales/en/multiUser.json` | İngilizce çeviriler **(i18n JSON)** |

### Değiştirilecek Dosyalar
| Dosya | Değişiklik |
|-------|------------|
| `src/contexts/AuthContext.tsx` | Multi-user alanları ekleme (genişletme) |
| `src/hooks/useAuth.ts` | Multi-user state yönetimi ekleme |
| `src/hooks/useIslemler.ts` | Değişiklik gerekmiyor - audit log DB trigger ile otomatik **(v7)** |
| `src/lib/queryKeys.ts` | multiUser, profiles, auditLog keys + invalidationMap |
| `src/i18n/index.ts` | multiUser import + namespace ekleme |
| `src/app/(tabs)/daha.tsx` | Kullanıcı menü bölümü ekleme |
| `src/app/(tabs)/_layout.tsx` | Tab bar filtreleme **(v5)** |
| `src/types/database.ts` | created_by/updated_by alanları |
| Tüm liste bileşenleri | UserAvatar gösterimi + PermissionGate sarma (opsiyonel)

---

## daha.tsx Menü Entegrasyonu

> **Pattern:** Mevcut MenuItem bileşeni ve Section yapısı kullanılacak. Ayarlar bölümüne yeni menü öğeleri eklenecek.

```typescript
// src/app/(tabs)/daha.tsx - DEĞİŞİKLİKLER

import { Users, Building2, UserPlus } from 'lucide-react-native';

// Yeni state (paylaşılan işletme sayısı için badge)
const { sharedIsletmeler, isOwner } = useAuthContext();
const sharedCount = sharedIsletmeler?.length ?? 0;

// Ayarlar Section içine ekleme (Categories'den sonra):

{/* Kullanıcılar - Sadece Owner görür */}
{isOwner && (
  <>
    <View style={styles.divider} />
    <MenuItem
      icon={<Users size={22} color={colors.primary} />}
      label={t('multiUser:users.title')}
      onPress={() => router.push('/ayarlar/kullanici-yonetimi')}
    />
  </>
)}

{/* Paylaşılan İşletmeler - Herkes görür */}
<View style={styles.divider} />
<MenuItem
  icon={<Building2 size={22} color={colors.info} />}
  label={t('multiUser:shared.title')}
  onPress={() => router.push('/ayarlar/paylasilan-isletmeler')}
  badge={sharedCount > 0 ? sharedCount : undefined}
/>
```

**Menü Sırası (Güncellenmiş Ayarlar Bölümü):**
1. İşletme Bilgileri
2. Kategoriler
3. **Kullanıcılar** (sadece owner) ← YENİ
4. **Paylaşılan İşletmeler** ← YENİ
5. **İşlem Geçmişi** (sadece owner) ← YENİ (v5)
6. Veri İçe Aktar
7. Arşiv
8. Dil
9. Para Birimi
10. Tarih Formatı

```typescript
{/* İşlem Geçmişi - Sadece Owner görür (v5) */}
{isOwner && (
  <>
    <View style={styles.divider} />
    <MenuItem
      icon={<History size={22} color={colors.warning} />}
      label={t('multiUser:auditLog.title')}
      onPress={() => router.push('/ayarlar/islem-gecmisi')}
    />
  </>
)}
```

---

## Sayfa Layout Standartları

> **ÖNEMLİ:** Tüm yeni sayfalar mevcut `ayarlar/isletme.tsx` pattern'ini takip etmeli.

```typescript
// Standart sayfa yapısı örneği: src/app/ayarlar/kullanici-yonetimi.tsx

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, Card, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

export default function KullaniciYonetimiPage() {
  const router = useRouter();
  const { t } = useTranslation(['multiUser', 'common']);
  const { isletme, isOwner } = useAuthContext();

  // Owner değilse gösterme (yönlendirme YOK - "Gizle" stratejisi ile tutarlı)
  if (!isOwner) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h2">{t('multiUser:users.title')}</Text>
            <Text variant="body" color="secondary">
              {t('multiUser:users.subtitle')}
            </Text>
          </View>

          {/* Content */}
          {/* ... */}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              variant="primary"
              size="lg"
              onPress={() => router.push('/ayarlar/davet-olustur')}
            >
              {t('multiUser:users.invite')}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});
```

**Loading State Kombinasyonu:**
```typescript
// Birden fazla loading state'i birleştirme
const { isletme, isletmeLoading, multiUserLoading } = useAuthContext();
const { data: users, isLoading: usersLoading } = useIsletmeUsers();

// Tüm loading state'lerini kontrol et
const isLoading = isletmeLoading || multiUserLoading || usersLoading;

if (isLoading) {
  return <LoadingSpinner />;
}
```

---

## Test Senaryoları

### Davet Akışı
- [ ] Owner davet kodu oluşturabilir
- [ ] Kod 7 gün geçerli
- [ ] Kod tek kullanımlık (accepted sonrası geçersiz)
- [ ] Aynı kullanıcı tekrar davet edilemez
- [ ] Owner kendi işletmesine davet kabul edemez
- [ ] Rate limit çalışıyor (10/saat)

### Yetki Kontrolleri
- [ ] Owner her şeyi görebilir/yapabilir
- [ ] Shared user sadece yetkili modülleri görebilir
- [ ] Pasif kayıtlar can_see_passive=false ise görünmez
- [ ] Arşiv kayıtlar can_see_archived=false ise görünmez
- [ ] Kendi kaydını düzenleyebilir (can_update_own)
- [ ] Başkasının kaydını düzenleyemez (can_update_all=false)

### İşletme Switch
- [ ] Ayarlardan paylaşılan işletmeye geçiş
- [ ] Banner gösterimi
- [ ] Çıkış butonu çalışıyor
- [ ] Query cache düzgün invalidate oluyor

### Audit Trail
- [ ] created_by otomatik set ediliyor
- [ ] updated_by güncelleniyor
- [ ] created_by değiştirilemiyor
- [ ] UserAvatar düzgün gösteriliyor

### Yetki Görünürlük (v5)
- [ ] Yetkisiz tab bar öğeleri gizleniyor
- [ ] Yetkisiz menü öğeleri gizleniyor
- [ ] Yetkisiz butonlar gizleniyor (PermissionGate)
- [ ] Owner yetkileri sonradan düzenleyebiliyor

### İşlem Geçmişi / Audit Log (v6)
- [ ] Silinen işlemler `islem_audit_log` tablosunda kalıcı olarak kayıtlı
- [ ] Owner silinen işlemleri `old_data`'dan yeniden oluşturabilir (recreate)
- [ ] Düzenlenen işlemler listesi (kim düzenledi, eski/yeni değerler)
- [ ] Normal kullanıcılar audit log'u göremez (sadece owner)

---

## v5 Değişiklik Özeti

### v4'ten v5'e Eklenenler

| # | Özellik | Açıklama |
|---|---------|----------|
| 1 | Yetki Görünürlük Stratejisi | Tab/menü/buton gizleme kuralları belirlendi |
| 2 | Kullanıcı Yetkisi Düzenleme | Owner mevcut kullanıcıları düzenleyebilir |
| 3 | UserEditSheet bileşeni | Yetki düzenleme bottom sheet |
| 4 | PermissionEditor bileşeni | Modül bazlı yetki checkbox'ları |
| 5 | İşlem Geçmişi (Audit Log) | Silinen/düzenlenen işlemler sayfası |
| 6 | `islem_audit_log` tablosu | Hard delete korundu + audit log ile kayıt (v6 düzeltmesi) |
| 7 | Yeniden oluşturma | Owner silinen işlemleri log'dan yeniden oluşturabilir |
| 8 | ~~Otomatik temizlik~~ | ~~7 gün sonra kalıcı silme~~ → v6'da kaldırıldı (hard delete + log) |
| 9 | Tab bar filtreleme | Yetkisiz modüller tab bar'da görünmez (`href: null`) |
| 10 | useAuditLog hook | `islem_audit_log` tablosundan React Query hooks |

### v4 Düzeltmeleri (korundu)

| # | Sorun | Çözüm |
|---|-------|-------|
| 1 | Dosya isimlendirme | kebab-case kullanımı |
| 2 | IsletmeContext | AuthContext genişletme |
| 3 | queryKeys.ts | multiUser, profiles, auditLog key'leri |
| 4 | invalidationMap | isletmeUser entity |
| 5 | PermissionGate | Tam bileşen tanımı |
| 6 | i18n | JSON formatında TR/EN çeviriler |
| 7 | Sayfa layout | SafeAreaView/KeyboardAvoidingView |
| 8 | daha.tsx | MenuItem pattern |
| 9 | Loading states | isletmeLoading + multiUserLoading |
| 10 | SharedIsletmeBanner | ArchivedBanner pattern |

### Kritik Dosya Değişiklikleri (v5)

```
src/
├── contexts/
│   └── AuthContext.tsx           ← GENİŞLETİLDİ
├── hooks/
│   ├── useAuth.ts                ← GENİŞLETİLDİ
│   ├── usePermissions.ts         ← YENİ
│   ├── useMultiUser.ts           ← YENİ
│   ├── useAuditLog.ts            ← YENİ (islem_audit_log tablosundan okuma)
│   └── useIslemler.ts            ← DEĞİŞİKLİK YOK (audit log DB trigger ile otomatik)
├── lib/
│   └── queryKeys.ts              ← GÜNCELLENDİ (auditLog keys)
├── components/
│   ├── ui/
│   │   └── SharedIsletmeBanner.tsx
│   ├── multiUser/                ← YENİ KLASÖR (v5)
│   │   ├── UserEditSheet.tsx
│   │   ├── PermissionEditor.tsx
│   │   └── RoleSelector.tsx
│   ├── UserAvatar.tsx
│   └── PermissionGate.tsx
├── i18n/
│   ├── index.ts
│   └── locales/
│       ├── tr/multiUser.json     ← auditLog eklendi (v5)
│       └── en/multiUser.json     ← auditLog eklendi (v5)
├── types/
│   └── multiUser.ts
└── app/
    ├── (tabs)/
    │   ├── _layout.tsx           ← GÜNCELLENDİ (tab filtreleme) (v5)
    │   └── daha.tsx
    └── ayarlar/
        ├── kullanici-yonetimi.tsx
        ├── paylasilan-isletmeler.tsx
        ├── davet-olustur.tsx
        └── islem-gecmisi.tsx     ← YENİ (v5)
```

### Veritabanı Eklentileri (v5 → v6 düzeltmesi)

```sql
-- v6: islem_audit_log tablosu (soft delete YERİNE)
CREATE TABLE islem_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  isletme_id UUID NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  islem_id UUID,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v6: leave_isletme RPC (YENİ)
CREATE FUNCTION leave_isletme(p_isletme_id UUID);

-- v6: Ek RLS policy'leri
-- cekler, nakit_avanslar, ileri_tarihli_islemler, urunler, urun_hareketler
-- isletmeler SELECT (shared user erişimi)
-- Storage bucket (shared user erişimi)
```

---

## Photo Storage RLS Policy Güncellemesi

> **Ekleme Tarihi:** 2026-01-22
> **İlgili Özellik:** İşlem Fotoğrafı Ekleme

### Mevcut Durum

`islem-photos` bucket için oluşturulan RLS policy'leri sadece owner kontrolü yapıyor:

```sql
-- Mevcut policy (sadece owner erişimi)
CREATE POLICY "Users can upload own islem photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'islem-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
  )
);
```

### Multi-User Güncellemesi

Çoklu kullanıcı özelliği aktif olduğunda, fotoğraf RLS policy'leri de güncellenmelidir:

```sql
-- Güncellenmesi gereken policy: INSERT
DROP POLICY IF EXISTS "Users can upload own islem photos" ON storage.objects;
CREATE POLICY "Users can upload own islem photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'islem-photos'
  AND (
    -- Owner kontrolü (mevcut ile AYNI)
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
    OR
    -- Shared user kontrolü (islem_create yetkisi gerekli)
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id::text = (storage.foldername(name))[1]
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false) = true
    )
  )
);

-- Güncellenmesi gereken policy: SELECT
DROP POLICY IF EXISTS "Users can view own islem photos" ON storage.objects;
CREATE POLICY "Users can view own islem photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (
    -- Owner kontrolü
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
    OR
    -- Shared user kontrolü (islem_read yetkisi gerekli)
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id::text = (storage.foldername(name))[1]
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false) = true
    )
  )
);

-- Güncellenmesi gereken policy: DELETE
DROP POLICY IF EXISTS "Users can delete own islem photos" ON storage.objects;
CREATE POLICY "Users can delete own islem photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'islem-photos'
  AND (
    -- Owner kontrolü
    (storage.foldername(name))[1] IN (
      SELECT id::text FROM isletmeler WHERE user_id = auth.uid()
    )
    OR
    -- Shared user kontrolü (islem_delete yetkisi gerekli)
    EXISTS (
      SELECT 1 FROM isletme_users iu
      WHERE iu.isletme_id::text = (storage.foldername(name))[1]
      AND iu.user_id = auth.uid()
      AND iu.status = 'active'
      AND COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false) = true
    )
  )
);
```

### Notlar

- Bu güncelleme, multi-user migration'ının bir parçası olarak yapılmalıdır
- `isletme_users` tablosu oluşturulduktan SONRA çalıştırılmalıdır
- Owner kontrolü HER ZAMAN İLK sırada kalmalıdır (SQL OR optimizasyonu)
- Cari paylaşma özelliği fotoğrafları ETKİLEMEZ (fotoğraflar işleme bağlı, cariye değil)
- **v6 DÜZELTMESİ:** `iu.is_active = true` → `iu.status = 'active'` olarak düzeltildi (`isletme_users` tablosunda `is_active` kolonu yok, `status TEXT` kullanılıyor)
- **v6 DÜZELTMESİ:** `(iu.permissions->>'islem_create')` → `COALESCE((iu.permissions->'modules'->>'islemler')::boolean, false)` olarak düzeltildi (permissions yapısı JSONB nested, `modules` altında)
