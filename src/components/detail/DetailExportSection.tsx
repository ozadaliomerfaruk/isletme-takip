import { useState, useCallback } from 'react';
import { Share, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react-native';
import { ExportSheet, ShareOptionsSheet, PdfExportSheet } from '@/components/export';
import { ActionSheet } from '@/components/ui';
import { colors } from '@/constants/colors';
import { useEkstreLinkOlustur } from '@/hooks/useEkstreLink';
import type { EntityType } from '@/lib/excelExport';
import type { Currency } from '@/types/database';

interface DetailExportSectionProps {
  visible: boolean;
  onDismiss: () => void;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
  currentIsletmeId?: string;
  typeMismatch?: boolean;
  phone?: string;
  onSharePress?: () => void;
}

export function DetailExportSection({
  visible,
  onDismiss,
  entityType,
  entityId,
  entityName,
  entityCurrency,
  currentBalance,
  cariType,
  currentIsletmeId,
  typeMismatch,
  phone,
  onSharePress,
}: DetailExportSectionProps) {
  const { t } = useTranslation('common');
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  // Ekstre linki süre seçimi (kullanıcı isteği: paylaşan belirler)
  const [showSureSheet, setShowSureSheet] = useState(false);
  const ekstreLink = useEkstreLinkOlustur();

  const handlePdfPress = useCallback(() => setShowPdfExport(true), []);
  const handleExcelPress = useCallback(() => setShowExportSheet(true), []);

  // Faz 4: public web-ekstre linki üret + native paylaşım sayfası.
  // Cari başına tek aktif link (sunucu eskisini otomatik iptal eder).
  // gecerlilikGun null = süresiz.
  const handleEkstreLink = useCallback(async (gecerlilikGun: number | null) => {
    try {
      const { url } = await ekstreLink.mutateAsync({ cariId: entityId, gecerlilikGun });
      await Share.share({ message: `${entityName} — ${t('export.ekstreLink')}\n${url}` });
    } catch (err) {
      Alert.alert(
        t('status.error'),
        (err as { message?: string })?.message ?? t('errors.unknownError'),
      );
    }
  }, [ekstreLink, entityId, entityName, t]);

  const sureOptions = [
    { label: t('export.ekstreSure.gun1'), gun: 1 as number | null },
    { label: t('export.ekstreSure.hafta1'), gun: 7 as number | null },
    { label: t('export.ekstreSure.ay1'), gun: 30 as number | null },
    { label: t('export.ekstreSure.yil1'), gun: 365 as number | null },
    { label: t('export.ekstreSure.suresiz'), gun: null as number | null },
  ].map((o) => ({
    label: o.label,
    icon: <Clock size={20} color={colors.primary} />,
    onPress: () => handleEkstreLink(o.gun),
  }));

  return (
    <>
      <ShareOptionsSheet
        visible={visible}
        onDismiss={onDismiss}
        entityType={entityType}
        onPdfPress={handlePdfPress}
        onExcelPress={handleExcelPress}
        onSharePress={onSharePress}
        onEkstreLinkPress={entityType === 'cari' ? () => setShowSureSheet(true) : undefined}
      />

      {/* Ekstre linki geçerlilik süresi seçimi */}
      <ActionSheet
        visible={showSureSheet}
        onClose={() => setShowSureSheet(false)}
        title={t('export.ekstreSure.title')}
        options={sureOptions}
        cancelLabel={t('buttons.cancel')}
      />

      <PdfExportSheet
        visible={showPdfExport}
        onDismiss={() => setShowPdfExport(false)}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        entityCurrency={entityCurrency}
        currentBalance={currentBalance}
        cariType={cariType}
        currentIsletmeId={currentIsletmeId}
        typeMismatch={typeMismatch}
        phone={phone}
      />

      <ExportSheet
        visible={showExportSheet}
        onDismiss={() => setShowExportSheet(false)}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        entityCurrency={entityCurrency}
        currentBalance={currentBalance}
        cariType={cariType}
        currentIsletmeId={currentIsletmeId}
        typeMismatch={typeMismatch}
      />
    </>
  );
}
