import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Package, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, Button, Modal } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius, fontWeight } from '@/constants/spacing';
import { formatCurrency, formatQuantity, formatPercent } from '@/lib/currency';
import {
  useUrunHareketlerByIslemId,
  useUrunKalemlerByIslemIds,
} from '@/hooks/useUrunHareketler';
import { usePermissions } from '@/hooks/usePermissions';
import type { Currency } from '@/types/database';

/**
 * İşleme bağlı ürün kalemlerini (ad · miktar × birim fiyat + KDV + toplam) alt-sheet
 * olarak gösteren paylaşılan modal. Cari/hesap/kredi kartı/işlemler detaylarında
 * ürün "kutu ikonu" olan satıra tıklanınca açılır — tek standart.
 */
export function ProductDetailModal({
  islemId,
  onDismiss,
  onEdit,
  currency,
}: {
  islemId: string | null;
  onDismiss: () => void;
  onEdit?: (islemId: string) => void;
  /** İşlemin para birimi. Verilmezse ana para biriminin sembolü basılır (çağıran
   *  sayfaların hepsi TransactionRow'a geçirdiği currency'yi buraya da geçmeli). */
  currency?: Currency | string | null;
}) {
  const { t } = useTranslation(['clients', 'common', 'products']);
  const { canAccessModule } = usePermissions();
  const canSeeUrunler = canAccessModule('urunler');
  const {
    data: urunHareketler,
    isLoading: isFullItemsLoading,
    isError: isFullItemsError,
  } = useUrunHareketlerByIslemId(islemId || undefined);
  const {
    getUrunItems,
    isProductItemsResolved,
    isError: isSummaryItemsError,
  } = useUrunKalemlerByIslemIds(
    islemId && !canSeeUrunler ? [islemId] : [],
    true,
  );
  const summaryItems = islemId ? getUrunItems(islemId) : [];
  const isLoading = canSeeUrunler
    ? isFullItemsLoading
    : !isProductItemsResolved;
  const isError = canSeeUrunler
    ? isFullItemsError
    : isSummaryItemsError;
  const windowHeight = Dimensions.get('window').height;

  if (!islemId) return null;

  return (
    <Modal
      visible={!!islemId}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayBackdrop}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <View style={[styles.content, { maxHeight: windowHeight * 0.75 }]}>
          <View style={styles.header}>
            <Text variant="h3">{t('clients:productDetail.title')}</Text>
            <TouchableOpacity onPress={onDismiss}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loading}>
              <Text variant="body" color="secondary">{t('common:status.loading')}</Text>
            </View>
          ) : isError ? (
            <View style={styles.loading}>
              <Text variant="body" color="secondary">{t('common:status.error')}</Text>
            </View>
          ) : canSeeUrunler && (!urunHareketler || urunHareketler.length === 0) ? (
            <View style={styles.loading}>
              <Text variant="body" color="secondary">{t('clients:productDetail.noProducts')}</Text>
            </View>
          ) : !canSeeUrunler && summaryItems.length === 0 ? (
            <View style={styles.loading}>
              <Text variant="body" color="secondary">{t('clients:productDetail.noProducts')}</Text>
            </View>
          ) : canSeeUrunler ? (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
            >
              {(urunHareketler ?? []).map((hareket) => {
                const subtotal = Math.abs(hareket.miktar) * (hareket.birim_fiyat || 0);
                const kdvAmount = subtotal * ((hareket.kdv_orani || 0) / 100);
                const total = subtotal + kdvAmount;
                // Birim DB kodu olarak tutulur ("kg", "porsiyon"...) — ekranda çevirisi basılır
                const birim = hareket.urunler?.birim;
                const birimLabel = birim ? t(`products:units.${birim}`) : '';
                return (
                  <View key={hareket.id} style={styles.item}>
                    <View style={styles.itemHeader}>
                      <Package size={16} color={colors.primary} />
                      <Text variant="body" style={styles.itemName} numberOfLines={2}>
                        {hareket.urunler?.ad || '-'}
                      </Text>
                    </View>
                    <View style={styles.itemDetails}>
                      <Text variant="caption" color="secondary">
                        {formatQuantity(Math.abs(hareket.miktar))}{birimLabel ? ` ${birimLabel}` : ''} x {formatCurrency(hareket.birim_fiyat || 0, currency)}
                      </Text>
                      {(hareket.kdv_orani ?? 0) > 0 && (
                        <Text variant="caption" color="secondary">
                          {t('common:tax.vat')} {formatPercent(hareket.kdv_orani ?? 0)}: {formatCurrency(kdvAmount, currency)}
                        </Text>
                      )}
                      <Text variant="body" color="primary" style={styles.itemTotal}>
                        {formatCurrency(total, currency)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
            >
              {summaryItems.map((item, index) => {
                const subtotal =
                  Math.abs(item.miktar) * (item.birim_fiyat || 0);
                const birimLabel = item.birim
                  ? t(`products:units.${item.birim}`)
                  : '';
                return (
                  <View key={`${item.ad}-${index}`} style={styles.item}>
                    <View style={styles.itemHeader}>
                      <Package size={16} color={colors.primary} />
                      <Text variant="body" style={styles.itemName} numberOfLines={2}>
                        {item.ad}
                      </Text>
                    </View>
                    <View style={styles.itemDetails}>
                      <Text variant="caption" color="secondary">
                        {formatQuantity(Math.abs(item.miktar))}
                        {birimLabel ? ` ${birimLabel}` : ''}
                        {' x '}
                        {formatCurrency(item.birim_fiyat || 0, currency)}
                      </Text>
                      <Text variant="body" color="primary" style={styles.itemTotal}>
                        {formatCurrency(subtotal, currency)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {onEdit && (
          <View style={styles.footer}>
            <Button
              variant="secondary"
              size="md"
              onPress={() => onEdit(islemId)}
              style={{ flex: 1 }}
            >
              {t('common:buttons.edit')}
            </Button>
          </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    flex: 1,
  },
  content: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  list: {
    marginBottom: spacing.md,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  itemName: {
    flex: 1,
    fontWeight: fontWeight.medium as '500',
  },
  itemDetails: {
    paddingLeft: spacing.lg + spacing.sm,
  },
  itemTotal: {
    fontWeight: fontWeight.semibold as '600',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
