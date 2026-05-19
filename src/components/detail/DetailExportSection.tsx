import { useState, useCallback } from 'react';
import { ExportSheet, ShareOptionsSheet, PdfExportSheet } from '@/components/export';
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
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);

  const handlePdfPress = useCallback(() => setShowPdfExport(true), []);
  const handleExcelPress = useCallback(() => setShowExportSheet(true), []);

  return (
    <>
      <ShareOptionsSheet
        visible={visible}
        onDismiss={onDismiss}
        entityType={entityType}
        onPdfPress={handlePdfPress}
        onExcelPress={handleExcelPress}
        onSharePress={onSharePress}
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
