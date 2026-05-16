import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileText, FileSpreadsheet, Link } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { EntityType } from '@/lib/excelExport';

interface ShareOptionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  entityType: EntityType;
  onPdfPress: () => void;
  onExcelPress: () => void;
  onSharePress?: () => void;
}

interface OptionItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
}

function OptionItem({ icon, title, description, onPress }: OptionItemProps) {
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.optionIcon}>{icon}</View>
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function ShareOptionsSheet({
  visible,
  onDismiss,
  entityType,
  onPdfPress,
  onExcelPress,
  onSharePress,
}: ShareOptionsSheetProps) {
  const { t } = useTranslation('common');

  const handlePdf = () => {
    onDismiss();
    setTimeout(onPdfPress, 300);
  };

  const handleExcel = () => {
    onDismiss();
    setTimeout(onExcelPress, 300);
  };

  const handleShare = () => {
    onDismiss();
    setTimeout(() => onSharePress?.(), 300);
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoints={[entityType === 'cari' && onSharePress ? 0.42 : 0.32]}
    >
      <View style={styles.container}>
        <Text style={styles.header}>{t('export.shareOptions')}</Text>

        {entityType === 'cari' && onSharePress && (
          <OptionItem
            icon={<Link size={22} color={colors.primary} />}
            title={t('export.accountShare')}
            description={t('export.accountShareDesc')}
            onPress={handleShare}
          />
        )}

        <OptionItem
          icon={<FileText size={22} color={colors.primary} />}
          title={t('export.pdfShare')}
          description={t('export.pdfShareDesc')}
          onPress={handlePdf}
        />

        <OptionItem
          icon={<FileSpreadsheet size={22} color={colors.primary} />}
          title={t('export.excelShare')}
          description={t('export.excelShareDesc')}
          onPress={handleExcel}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
    color: colors.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
