import { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Wallet, Users, UserCircle, Package } from 'lucide-react-native';
import { ActionSheet, type ActionSheetOption } from './ActionSheet';
import { usePermissions } from '@/hooks/usePermissions';
import { colors } from '@/constants/colors';
import { borderRadius, HIT_SLOP } from '@/constants/spacing';

/**
 * Her tab header'ının sağ-üstündeki tek tanıdık yeşil "+" (#7).
 *
 * Basınca izin-filtreli varlık-ekleme sheet'i açılır (Hesap · Cari · Personel · Ürün);
 * her satır standart /ekle sayfasına gider (kayıt-sonrası davranış o sayfalarda kurulu).
 *
 * - İzin: her satır `canCreate(modül)` ile korunur (rol bazlı; owner hepsini görür).
 *   Viewer / hiç create izni olmayan kullanıcıda buton HİÇ render olmaz.
 * - FAB'a dokunulmaz — bu ayrı, header-seviyesi bir giriş noktası.
 */
export function AddEntityButton() {
  const router = useRouter();
  const { t } = useTranslation(['common']);
  const { canCreate } = usePermissions();
  const [visible, setVisible] = useState(false);

  const go = (path: Href) => {
    setVisible(false);
    router.push(path);
  };

  const ICON = 22;
  const rows: Array<ActionSheetOption | false> = [
    canCreate('hesaplar') && {
      label: t('common:addEntity.account'),
      icon: <Wallet size={ICON} color={colors.primary} />,
      onPress: () => go('/hesaplar/ekle'),
    },
    canCreate('cariler') && {
      label: t('common:addEntity.client'),
      icon: <Users size={ICON} color={colors.info} />,
      onPress: () => go('/cariler/ekle'),
    },
    canCreate('personel') && {
      label: t('common:addEntity.staff'),
      icon: <UserCircle size={ICON} color={colors.warning} />,
      onPress: () => go('/personel/ekle'),
    },
    canCreate('urunler') && {
      label: t('common:addEntity.product'),
      icon: <Package size={ICON} color={colors.success} />,
      onPress: () => go('/urunler/ekle'),
    },
  ];
  const options = rows.filter(Boolean) as ActionSheetOption[];

  // Hiçbir şey eklenemiyorsa (viewer / izin yok) butonu hiç gösterme.
  if (options.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setVisible(true)}
        hitSlop={HIT_SLOP.md}
        accessibilityRole="button"
        accessibilityLabel={t('common:buttons.add')}
      >
        <Plus size={22} color={colors.white} />
      </TouchableOpacity>

      <ActionSheet
        visible={visible}
        onClose={() => setVisible(false)}
        title={t('common:addEntity.title')}
        options={options}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
