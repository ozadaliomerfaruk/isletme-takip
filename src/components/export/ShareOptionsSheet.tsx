import { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileText, FileSpreadsheet, Link, Globe } from 'lucide-react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Text } from '@/components/ui/Text';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { EntityType } from '@/lib/excelExport';

interface ShareOptionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  entityType: EntityType;
  onPdfPress: () => void;
  onExcelPress: () => void;
  onSharePress?: () => void;
  /** Faz 4: public web-ekstre linki (yalnız cari) */
  onEkstreLinkPress?: () => void;
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
  onEkstreLinkPress,
}: ShareOptionsSheetProps) {
  const { t } = useTranslation('common');
  const pendingActionRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runPendingAction = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    pendingAction?.();
  }, []);

  const dismissThen = useCallback((action: () => void) => {
    pendingActionRef.current = action;
    onDismiss();

    // RN Modal.onDismiss yalnız iOS'ta var. Diğer platformlarda mevcut güvenli
    // gecikme fallback'i davranışı korur; iOS ise native dismissal'ı bekler.
    if (Platform.OS !== 'ios') {
      fallbackTimerRef.current = setTimeout(runPendingAction, 300);
    }
  }, [onDismiss, runPendingAction]);

  useEffect(() => () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
  }, []);

  const handleEkstreLink = useCallback(
    () => dismissThen(() => onEkstreLinkPress?.()),
    [dismissThen, onEkstreLinkPress],
  );
  const handlePdf = useCallback(
    () => dismissThen(onPdfPress),
    [dismissThen, onPdfPress],
  );
  const handleExcel = useCallback(
    () => dismissThen(onExcelPress),
    [dismissThen, onExcelPress],
  );
  const handleShare = useCallback(
    () => dismissThen(() => onSharePress?.()),
    [dismissThen, onSharePress],
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onModalDismiss={runPendingAction}
      snapPoints={[
        entityType === 'cari' && onSharePress && onEkstreLinkPress
          ? 0.52
          : entityType === 'cari' && (onSharePress || onEkstreLinkPress)
            ? 0.42
            : 0.32,
      ]}
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

        {entityType === 'cari' && onEkstreLinkPress && (
          <OptionItem
            icon={<Globe size={22} color={colors.primary} />}
            title={t('export.ekstreLink')}
            description={t('export.ekstreLinkDesc')}
            onPress={handleEkstreLink}
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
  // Yapışık düz-liste standardı: kutu yok, ayrım 1px çizgi
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
