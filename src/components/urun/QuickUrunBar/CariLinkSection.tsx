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
import { borderRadius } from '@/constants/spacing';
import { useCariler } from '@/hooks/useCariler';
import { CariPickerSheet } from '@/components/transaction/QuickTransactionBar/components/CariPickerSheet';
import { KdvOrani } from '@/types/database';

const KDV_ORANLARI: KdvOrani[] = [0, 1, 10, 20];

interface CariLinkSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  selectedCariId: string | null;
  onSelectCari: (cariId: string | null) => void;
  kdvOrani: KdvOrani;
  onKdvChange: (kdv: KdvOrani) => void;
  /** 'giris' = supplier picker, 'cikis' = customer picker */
  hareketTipi: 'giris' | 'cikis';
  /** Calculated total with KDV for display */
  totalDisplay?: string;
  kdvDisplay?: string;
}

export function CariLinkSection({
  enabled,
  onToggle,
  selectedCariId,
  onSelectCari,
  kdvOrani,
  onKdvChange,
  hareketTipi,
  totalDisplay,
  kdvDisplay,
}: CariLinkSectionProps) {
  const { t } = useTranslation(['products', 'clients']);
  const [showPicker, setShowPicker] = useState(false);

  // Fetch cariler based on hareket type
  const cariType = hareketTipi === 'giris' ? 'tedarikci' : 'musteri';
  const { data: cariler } = useCariler(cariType);

  const selectedCari = useMemo(
    () => cariler?.find((c) => c.id === selectedCariId) || null,
    [cariler, selectedCariId]
  );

  return (
    <View style={sectionStyles.container}>
      {/* Toggle row */}
      <View style={sectionStyles.toggleRow}>
        <Building2 size={16} color={enabled ? colors.primary : colors.textMuted} />
        <RNText style={[sectionStyles.toggleLabel, enabled && sectionStyles.toggleLabelActive]}>
          {t('products:cariLink.toggle')}
        </RNText>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primaryLight }}
          thumbColor={enabled ? colors.primary : colors.textMuted}
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

          {/* KDV chips */}
          <View style={sectionStyles.kdvRow}>
            <RNText style={sectionStyles.kdvLabel}>{t('products:cariLink.vatRate')}:</RNText>
            {KDV_ORANLARI.map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  sectionStyles.kdvChip,
                  kdvOrani === rate && sectionStyles.kdvChipActive,
                ]}
                onPress={() => onKdvChange(rate)}
              >
                <RNText
                  style={[
                    sectionStyles.kdvChipText,
                    kdvOrani === rate && sectionStyles.kdvChipTextActive,
                  ]}
                >
                  %{rate}
                </RNText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Total display */}
          {totalDisplay && (
            <View style={sectionStyles.totalRow}>
              <RNText style={sectionStyles.totalText}>{totalDisplay}</RNText>
              {kdvDisplay && (
                <RNText style={sectionStyles.kdvText}> ({kdvDisplay} KDV)</RNText>
              )}
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
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  toggleLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  cariButton: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  cariButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  cariButtonPlaceholder: {
    color: colors.textMuted,
  },
  kdvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  kdvLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginRight: 4,
  },
  kdvChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  kdvChipActive: {
    backgroundColor: colors.primaryLight,
  },
  kdvChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  kdvChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  totalText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  kdvText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
