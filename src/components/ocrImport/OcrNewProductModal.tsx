import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PlusCircle, X } from 'lucide-react-native';
import { Text, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { OcrParsedItem } from '@/types/ocrImport';
import { formatQuantity } from '@/lib/currency';

interface OcrNewProductModalProps {
  visible: boolean;
  items: OcrParsedItem[];
  onConfirmAll: () => void;
  onSkipAll: () => void;
  onClose: () => void;
}

export function OcrNewProductModal({
  visible,
  items,
  onConfirmAll,
  onSkipAll,
  onClose,
}: OcrNewProductModalProps) {
  const { t } = useTranslation('ocrImport');

  if (items.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text variant="h3">{t('newProductModal.title')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text variant="body" color="secondary" style={styles.message}>
            {t('newProductModal.message')}
          </Text>

          {/* Product list */}
          <ScrollView style={styles.list}>
            {items.map((item, idx) => (
              <View key={item.id} style={styles.item}>
                <PlusCircle size={16} color={colors.info} />
                <View style={styles.itemInfo}>
                  <Text variant="body">{item.name}</Text>
                  <Text variant="caption" color="secondary">
                    {formatQuantity(item.quantity)} {item.unitRaw || 'AD'} x {item.unitPrice}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttons}>
            <Button
              variant="primary"
              onPress={onConfirmAll}
              style={styles.button}
            >
              {t('newProductModal.confirmAll')}
            </Button>
            <Button
              variant="outline"
              onPress={onSkipAll}
              style={styles.button}
            >
              {t('newProductModal.skipAll')}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  message: {
    marginBottom: spacing.lg,
  },
  list: {
    maxHeight: 300,
    marginBottom: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemInfo: {
    flex: 1,
  },
  buttons: {
    gap: spacing.md,
  },
  button: {
    width: '100%',
  },
});
