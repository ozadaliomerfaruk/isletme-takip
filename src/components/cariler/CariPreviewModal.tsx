import { Modal, View, StyleSheet, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Zap, ArrowRight, Share as ShareIcon, Phone } from 'lucide-react-native';
import { Text, Avatar } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '@/constants/spacing';
import { formatCurrency, toNumber } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { getEntityPerspectiveColor, getEntityPerspectivePrefix } from '@/lib/transactionColors';
import type { Cari, IslemType } from '@/types/database';

/** Önizlemede gösterilecek cari — liste satırındaki birleşik tip (link meta opsiyonel). */
export type PreviewCari = Cari & {
  isLinked?: boolean;
  linkPermission?: string;
};

interface CariPreviewModalProps {
  cari: PreviewCari | null;
  onDismiss: () => void;
  onIslemYap?: (cari: PreviewCari) => void;
  onDetay?: (cari: PreviewCari) => void;
  /** Ekstre paylaşım akışını açar (DetailExportSection). */
  onEkstre?: (cari: PreviewCari) => void;
  /** Gecikmiş vade tutarı (vadeRozetMap'ten; yoksa rozet gizli). */
  gecikmisTutar?: number | null;
  gecikmisCurrency?: string;
}

const TX_LABEL_KEY: Record<string, string> = {
  cari_satis: 'satis',
  cari_alis: 'alis',
  cari_tahsilat: 'tahsilat',
  cari_odeme: 'odeme',
  cari_satis_iade: 'satisIade',
  cari_alis_iade: 'alisIade',
};

/** Önizleme için son 3 işlem — hafif, önizleme açılınca taze çekilir. */
function useSonIslemler(cariId: string | undefined) {
  const { isletme } = useAuthContext();
  return useQuery({
    queryKey: ['cari-preview-islemler', cariId ?? '', isletme?.id ?? ''],
    enabled: !!cariId && !!isletme?.id,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('islemler')
        .select('id, type, amount, date, hesap:hesaplar!hesap_id(name)')
        .eq('isletme_id', isletme!.id)
        .eq('cari_id', cariId!)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * iOS context-menu (peek) taklidi (JS): cari satırına uzun basınca buzlu arka
 * plan üstünde özet kartı + hızlı aksiyonlar. Native değil — her iki platformda
 * aynı çalışır; beğenilirse build 70'te gerçek iOS context menu'ye geçilebilir.
 */
export function CariPreviewModal({
  cari,
  onDismiss,
  onIslemYap,
  onDetay,
  onEkstre,
  gecikmisTutar,
  gecikmisCurrency,
}: CariPreviewModalProps) {
  const { t } = useTranslation(['clients', 'common', 'transactions']);
  const { data: sonIslemler, isLoading } = useSonIslemler(cari?.id);

  if (!cari) return null;

  const bal = toNumber(cari.balance);
  const balanceLabel = bal === 0
    ? t('clients:balance.noBalance')
    : cari.type === 'tedarikci'
      ? (bal < 0 ? t('clients:balance.weOwe') : t('clients:balance.theyOwe'))
      : (bal > 0 ? t('clients:balance.theyOwe') : t('clients:balance.weOwe'));
  const balanceColor = bal === 0 ? colors.textSecondary : bal > 0 ? colors.success : colors.error;

  const aksiyonlar = [
    onEkstre && {
      key: 'ekstre',
      icon: <ShareIcon size={16} color={colors.primary} />,
      label: t('clients:preview.ekstrePaylas'),
      onPress: () => onEkstre(cari),
    },
    onIslemYap && {
      key: 'islem',
      icon: <Zap size={18} color={colors.white} />,
      label: t('common:archive.actions.makeTransaction'),
      primary: true,
      onPress: () => onIslemYap(cari),
    },
    onDetay && {
      key: 'detay',
      icon: <ArrowRight size={18} color={colors.primary} />,
      label: t('clients:preview.detay'),
      onPress: () => onDetay(cari),
    },
  ].filter(Boolean) as { key: string; icon: React.ReactNode; label: string; primary?: boolean; onPress: () => void }[];

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onDismiss}>
      {/* Buzlu arka plan — dokununca kapanır */}
      <Animated.View style={StyleSheet.absoluteFill} entering={FadeIn.duration(150)}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onDismiss} />
      </Animated.View>

      <View style={styles.center} pointerEvents="box-none">
        {/* Sekmesiz (spring'siz) düz büyüme — kullanıcı tercihi */}
        <Animated.View entering={ZoomIn.duration(180)} style={styles.card}>
          {/* Başlık */}
          <View style={styles.header}>
            <Avatar name={cari.name} size={48} />
            <View style={styles.headerInfo}>
              <Text variant="h3" numberOfLines={2}>{cari.name}</Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {cari.type === 'tedarikci' ? t('clients:types.tedarikci') : t('clients:types.musteri')}
              </Text>
            </View>
          </View>

          {/* Bakiye */}
          <View style={styles.balanceBlock}>
            <Text variant="caption" color="secondary">{balanceLabel}</Text>
            <Text style={[styles.balanceValue, { color: balanceColor }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatCurrency(Math.abs(bal), cari.currency)}
            </Text>
            {gecikmisTutar != null && gecikmisTutar > 0 && (
              <View style={styles.vadeRozet}>
                <Text style={styles.vadeRozetText} numberOfLines={1}>
                  {t('transactions:vade.overdue')} · {formatCurrency(gecikmisTutar, gecikmisCurrency || cari.currency)}
                </Text>
              </View>
            )}
          </View>

          {/* Telefon / not */}
          {cari.phone ? (
            <View style={styles.metaRow}>
              <Phone size={13} color={colors.textMuted} />
              <Text variant="caption" color="secondary" numberOfLines={1}>{cari.phone}</Text>
            </View>
          ) : null}
          {cari.notes ? (
            <Text variant="caption" color="secondary" numberOfLines={2} style={styles.notes}>
              {cari.notes}
            </Text>
          ) : null}

          {/* Son işlemler */}
          <View style={styles.sonIslemlerBlock}>
            <Text style={styles.sectionTitle}>{t('clients:preview.sonIslemler')}</Text>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
            ) : !sonIslemler || sonIslemler.length === 0 ? (
              <Text variant="caption" color="muted">{t('clients:preview.islemYok')}</Text>
            ) : (
              sonIslemler.map((islem) => {
                // Detay sayfasıyla AYNI dil: perspektif rengi + +/- öneki + hesap oku
                // (ödeme → hesaba gider, tahsilat ← hesaptan gelir; cariler/[id] deseni)
                const tip = islem.type as IslemType;
                const renk = getEntityPerspectiveColor(tip);
                const onek = getEntityPerspectivePrefix(tip);
                const hesapRaw = (islem as { hesap?: { name: string } | { name: string }[] | null }).hesap;
                const hesap = Array.isArray(hesapRaw) ? hesapRaw[0] : hesapRaw;
                return (
                  <View key={islem.id} style={styles.islemRow}>
                    <Text variant="caption" color="secondary" style={styles.islemDate}>
                      {formatDateShort(islem.date)}
                    </Text>
                    <View style={styles.islemMid}>
                      <Text variant="caption" style={[styles.islemType, { color: renk }]} numberOfLines={1}>
                        {TX_LABEL_KEY[islem.type]
                          ? t(`clients:transactionLabels.${TX_LABEL_KEY[islem.type]}`)
                          : islem.type}
                      </Text>
                      {hesap?.name ? (
                        <Text variant="caption" color="muted" numberOfLines={1} style={styles.islemHesap}>
                          {tip === 'cari_odeme' ? '→ ' : '← '}{hesap.name}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="caption" style={[styles.islemAmount, { color: renk }]} numberOfLines={1}>
                      {onek}{formatCurrency(toNumber(islem.amount), cari.currency)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </Animated.View>

        {/* Aksiyonlar — kartın altında ayrı kapsül (iOS menü hissi) */}
        {aksiyonlar.length > 0 && (
          <Animated.View entering={ZoomIn.duration(180).delay(40)} style={styles.actions}>
            {aksiyonlar.map((a, i) => (
              <TouchableOpacity
                key={a.key}
                style={[
                  styles.actionBtn,
                  a.primary && styles.actionBtnPrimary,
                  i > 0 && styles.actionBtnGap,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  onDismiss();
                  // Modal kapanışı ile çakışmasın (QTB/navigasyon açılışı)
                  setTimeout(() => a.onPress(), 120);
                }}
              >
                {a.icon}
                <Text style={[styles.actionLabel, a.primary && styles.actionLabelPrimary]} numberOfLines={1}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius['2xl'],
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  balanceBlock: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: 2,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
  },
  balanceValue: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
  },
  vadeRozet: {
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.errorLight,
  },
  vadeRozetText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.error,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  notes: {
    fontStyle: 'italic',
  },
  sonIslemlerBlock: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loader: {
    alignSelf: 'flex-start',
    marginVertical: spacing.xs,
  },
  islemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  islemDate: {
    width: 74,
  },
  islemMid: {
    flex: 1,
    minWidth: 0,
  },
  islemType: {
    fontWeight: fontWeight.semibold,
  },
  islemHesap: {
    fontSize: fontSize.xs,
  },
  islemAmount: {
    fontWeight: fontWeight.semibold,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xs,
    ...shadows.lg,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  actionBtnPrimary: {
    backgroundColor: colors.primary,
  },
  actionBtnGap: {
    marginLeft: spacing.xs,
  },
  actionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },
  actionLabelPrimary: {
    color: colors.white,
  },
});
