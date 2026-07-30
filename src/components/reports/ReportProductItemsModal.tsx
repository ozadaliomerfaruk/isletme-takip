import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Package, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Button, Modal, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import {
  borderRadius,
  fontWeight,
  spacing,
} from '@/constants/spacing';
import {
  formatCurrency,
  formatQuantity,
} from '@/lib/currency';
import type { UrunKalemOzet } from '@/hooks/useUrunHareketler';
import type { Currency } from '@/types/database';

interface ReportProductItemsModalProps {
  islemId: string | null;
  items: UrunKalemOzet[];
  isLoading: boolean;
  currency?: Currency | string | null;
  onDismiss: () => void;
  onEdit?: (islemId: string) => void;
}

export function ReportProductItemsModal({
  islemId,
  items,
  isLoading,
  currency,
  onDismiss,
  onEdit,
}: ReportProductItemsModalProps) {
  const { t } = useTranslation(['clients', 'common', 'products']);
  if (!islemId) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onDismiss}
        />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="h3">
              {t('clients:productDetail.title')}
            </Text>
            <TouchableOpacity onPress={onDismiss}>
              <X size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.empty}>
              <Text variant="body" color="secondary">
                {t('common:status.loading')}
              </Text>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Text variant="body" color="secondary">
                {t('clients:productDetail.noProducts')}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {items.map((item, index) => (
                <View
                  key={`${item.ad}:${item.birim}:${index}`}
                  style={styles.item}
                >
                  <View style={styles.itemHeader}>
                    <Package size={16} color={colors.primary} />
                    <Text
                      variant="body"
                      style={styles.itemName}
                      numberOfLines={2}
                    >
                      {item.ad}
                    </Text>
                  </View>
                  <Text variant="caption" color="secondary">
                    {formatQuantity(item.miktar)}
                    {item.birim ? ` ${item.birim}` : ''}
                    {item.birim_fiyat == null
                      ? ''
                      : ` × ${formatCurrency(
                          item.birim_fiyat,
                          currency,
                        )}`}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {onEdit ? (
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
          ) : null}
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
  backdrop: {
    flex: 1,
  },
  content: {
    maxHeight: '75%',
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
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  list: {
    marginBottom: spacing.md,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  footer: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
});
