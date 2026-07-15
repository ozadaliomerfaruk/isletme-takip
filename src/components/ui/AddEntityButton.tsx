import { useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus, Wallet, Users, UserCircle, Package } from 'lucide-react-native';
import { ActionSheet, type ActionSheetOption } from './ActionSheet';
import { Text } from './Text';
import { usePermissions } from '@/hooks/usePermissions';
import { upperTr } from '@/lib/turkishTextUtils';
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
      label: upperTr(t('common:addEntity.account')),
      description: t('common:addEntity.accountDesc'),
      icon: <Wallet size={ICON} color={colors.primary} />,
      onPress: () => go('/hesaplar/ekle'),
    },
    canCreate('cariler') && {
      label: upperTr(t('common:addEntity.client')),
      description: t('common:addEntity.clientDesc'),
      icon: <Users size={ICON} color={colors.info} />,
      onPress: () => go('/cariler/ekle'),
    },
    canCreate('personel') && {
      label: upperTr(t('common:addEntity.staff')),
      description: t('common:addEntity.staffDesc'),
      icon: <UserCircle size={ICON} color={colors.warning} />,
      onPress: () => go('/personel/ekle'),
    },
    canCreate('urunler') && {
      label: upperTr(t('common:addEntity.product')),
      description: t('common:addEntity.productDesc'),
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
        <Plus size={18} color={colors.white} />
        <Text style={styles.buttonLabel}>{upperTr(t('common:buttons.add'))}</Text>
      </TouchableOpacity>

      <ActionSheet
        visible={visible}
        onClose={() => setVisible(false)}
        options={options}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
