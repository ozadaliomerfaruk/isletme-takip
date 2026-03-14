import { useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text as RNText,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { useCariler } from '@/hooks/useCariler';
import { CariPickerSheet } from '@/components/transaction/QuickTransactionBar/components/CariPickerSheet';

interface CariLinkSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  selectedCariId: string | null;
  onSelectCari: (cariId: string | null) => void;
  /** 'giris' = supplier picker, 'cikis' = customer picker */
  hareketTipi: 'giris' | 'cikis';
  /** Calculated subtotal for display */
  subtotalDisplay?: string;
  /** KDV total for display */
  kdvDisplay?: string;
  /** Grand total for display */
  totalDisplay?: string;
}

export function CariLinkSection({
  enabled,
  onToggle,
  selectedCariId,
  onSelectCari,
  hareketTipi,
  subtotalDisplay,
  kdvDisplay,
  totalDisplay,
}: CariLinkSectionProps) {
  const { t } = useTranslation(['products', 'clients', 'common']);
  const [showPicker, setShowPicker] = useState(false);

  // Fetch cariler based on hareket type
  const cariType = hareketTipi === 'giris' ? 'tedarikci' : 'musteri';
  const { data: cariler } = useCariler(cariType);

  const selectedCari = useMemo(
    () => cariler?.find((c) => c.id === selectedCariId) || null,
    [cariler, selectedCariId]
  );

  const accentColor = hareketTipi === 'giris' ? colors.primary : colors.error;

  return (
    <View style={sectionStyles.container}>
      {/* Toggle row */}
      <View style={sectionStyles.toggleRow}>
        <Building2 size={16} color={enabled ? accentColor : colors.textMuted} />
        <RNText style={[sectionStyles.toggleLabel, enabled && { color: accentColor, fontWeight: '600' }]}>
          {t('products:cariLink.toggle')}
        </RNText>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: hareketTipi === 'giris' ? colors.primaryLight : colors.errorLight }}
          thumbColor={enabled ? accentColor : colors.textMuted}
          style={sectionStyles.switch}
        />
      </View>

      {enabled && (
        <>
          {/* Cari selector button */}
          <TouchableOpacity
            style={sectionStyles.cariButton}
            onPress={() => setShowPicker(true)}
          >
            <RNText
              style={[
                sectionStyles.cariButtonText,
                !selectedCari && sectionStyles.cariButtonPlaceholder,
              ]}
              numberOfLines={1}
            >
              {selectedCari ? selectedCari.name : t('products:cariLink.selectClient')}
            </RNText>
          </TouchableOpacity>

          {/* Totals display */}
          {totalDisplay && (
            <View style={sectionStyles.totalContainer}>
              {subtotalDisplay && kdvDisplay && (
                <View style={sectionStyles.breakdownRow}>
                  <RNText style={sectionStyles.breakdownLabel}>{t('products:cariLink.subtotal')}</RNText>
                  <RNText style={sectionStyles.breakdownValue}>{subtotalDisplay}</RNText>
                </View>
              )}
              {kdvDisplay && (
                <View style={sectionStyles.breakdownRow}>
                  <RNText style={sectionStyles.breakdownLabel}>{t('common:currency.vat')}</RNText>
                  <RNText style={sectionStyles.breakdownValue}>{kdvDisplay}</RNText>
                </View>
              )}
              <View style={[sectionStyles.breakdownRow, sectionStyles.totalRow]}>
                <RNText style={sectionStyles.totalLabel}>{t('common:total')}</RNText>
                <RNText style={[sectionStyles.totalValue, { color: accentColor }]}>{totalDisplay}</RNText>
              </View>
            </View>
          )}
        </>
      )}

      {/* Cari Picker Sheet */}
      <CariPickerSheet
        visible={showPicker}
        onDismiss={() => setShowPicker(false)}
        onSelect={(id) => {
          onSelectCari(id);
          setShowPicker(false);
        }}
        cariler={cariler || []}
        selectedId={selectedCariId}
        mode={hareketTipi === 'giris' ? 'supplier' : 'customer'}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const sectionStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  cariButton: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 10,
  },
  cariButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cariButtonPlaceholder: {
    color: colors.textMuted,
  },
  totalContainer: {
    marginTop: 12,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: 2,
  },
  totalLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '700',
  },
});
