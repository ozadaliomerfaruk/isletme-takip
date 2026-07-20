import { useState, useCallback } from 'react';
import { Share, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ExportSheet, ShareOptionsSheet, PdfExportSheet } from '@/components/export';
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
  const ekstreLink = useEkstreLinkOlustur();

  const handlePdfPress = useCallback(() => setShowPdfExport(true), []);
  const handleExcelPress = useCallback(() => setShowExportSheet(true), []);

  // Faz 4: public web-ekstre linki üret + native paylaşım sayfası.
  // Cari başına tek aktif link (sunucu eskisini otomatik iptal eder).
  const handleEkstreLink = useCallback(async () => {
    try {
      const { url } = await ekstreLink.mutateAsync(entityId);
      await Share.share({ message: `${entityName} — ${t('export.ekstreLink')}\n${url}` });
    } catch (err) {
      Alert.alert(
        t('status.error'),
        (err as { message?: string })?.message ?? t('errors.unknownError'),
      );
    }
  }, [ekstreLink, entityId, entityName, t]);

  return (
    <>
      <ShareOptionsSheet
        visible={visible}
        onDismiss={onDismiss}
        entityType={entityType}
        onPdfPress={handlePdfPress}
        onExcelPress={handleExcelPress}
        onSharePress={onSharePress}
        onEkstreLinkPress={entityType === 'cari' ? handleEkstreLink : undefined}
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
