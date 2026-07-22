import { memo, useEffect, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { formatCurrency, roundCurrency, toNumber } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useCariVadeliBorclar, useCariTahsisOzeti } from '@/hooks/useIslemTahsis';
import { useCariTaksitBirimleri } from '@/hooks/useTaksit';

/**
 * "Nereye sayılsın?" — cari tahsilat/ödeme girerken açık vadeli borç / taksit
 * planı varsa hedef seçtiren chip satırı. Varsayılan "Otomatik" = bugünkü FIFO
 * (en eski etkin vade). Bir hedef seçilince tutar o birimin KALANIYLA ön-dolur
 * ve kayıt sonrası retahsis_odeme o borca öncelik verir (QTB içinde tetiklenir).
 * Açık birim yoksa satır hiç görünmez — mevcut akış değişmez.
 */

interface HedefBorcUnit {
  borcId: string;
  kalan: number;
  vade: string;
  label: string;
}

interface HedefBorcSeciciProps {
  cariId: string;
  yon: 'tahsilat' | 'odeme';
  currency?: string;
  selectedBorcId: string | null;
  onSelect: (borcId: string | null, kalan?: number) => void;
}

export const HedefBorcSecici = memo(function HedefBorcSecici({
  cariId,
  yon,
  currency,
  selectedBorcId,
  onSelect,
}: HedefBorcSeciciProps) {
  const { t } = useTranslation(['transactions']);
  const { formatDateMedium } = useDateFormat();
  const { data: vadeliBorclar } = useCariVadeliBorclar(cariId);
  const { data: taksitBirimleri } = useCariTaksitBirimleri(cariId);
  const { data: tahsisOzeti } = useCariTahsisOzeti(cariId);

  // Tahsilat satış borçlarını, ödeme alış borçlarını kapatır (tahsis_borc_tipleri ile aynı)
  const borcType = yon === 'tahsilat' ? 'cari_satis' : 'cari_alis';

  const units = useMemo((): HedefBorcUnit[] => {
    if (!tahsisOzeti || !vadeliBorclar) return [];
    const out: HedefBorcUnit[] = [];
    const taksitliIds = new Set(Object.keys(taksitBirimleri ?? {}));

    // Plansız vadeli borçlar: kalanı olanlar
    for (const b of vadeliBorclar) {
      if (b.type !== borcType || taksitliIds.has(b.id)) continue;
      const kalan = roundCurrency(toNumber(b.amount) - (tahsisOzeti.borcTahsisleri[b.id] ?? 0));
      if (kalan <= 0.009) continue;
      out.push({
        borcId: b.id,
        kalan,
        vade: String(b.vade_tarihi),
        label: `${formatDateMedium(String(b.vade_tarihi))} · ${formatCurrency(kalan, currency)}`,
      });
    }

    // Taksitli planlar: sıradaki açık taksit (plan başına tek chip)
    for (const [islemId, birimler] of Object.entries(taksitBirimleri ?? {})) {
      const islem = vadeliBorclar.find((v) => v.id === islemId);
      if (!islem || islem.type !== borcType) continue;
      const acik = birimler.find(
        (tk) => roundCurrency(tk.tutar - (tahsisOzeti.taksitTahsisleri?.[tk.id] ?? 0)) > 0.009
      );
      if (!acik) continue;
      const kalan = roundCurrency(acik.tutar - (tahsisOzeti.taksitTahsisleri?.[acik.id] ?? 0));
      out.push({
        borcId: islemId,
        kalan,
        vade: acik.vade_tarihi,
        label: `${t('transactions:taksit.siraLabel', { sira: acik.sira })} · ${formatCurrency(kalan, currency)}`,
      });
    }

    out.sort((a, b) => (a.vade < b.vade ? -1 : 1));
    return out.slice(0, 8);
  }, [vadeliBorclar, taksitBirimleri, tahsisOzeti, borcType, currency, formatDateMedium, t]);

  // Seçili hedef artık listede yoksa (cari değişti / borç kapandı) Otomatik'e dön
  useEffect(() => {
    if (selectedBorcId && tahsisOzeti && vadeliBorclar && !units.some((u) => u.borcId === selectedBorcId)) {
      onSelect(null);
    }
  }, [selectedBorcId, units, tahsisOzeti, vadeliBorclar, onSelect]);

  if (units.length === 0) return null;

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{t('transactions:vade.hedefBaslik')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={[s.chip, !selectedBorcId && s.chipActive]}
          onPress={() => onSelect(null)}
          activeOpacity={0.7}
        >
          <Text style={[s.chipText, !selectedBorcId && s.chipTextActive]}>
            {t('transactions:vade.hedefOtomatik')}
          </Text>
        </TouchableOpacity>
        {units.map((u) => (
          <TouchableOpacity
            key={u.borcId}
            style={[s.chip, selectedBorcId === u.borcId && s.chipActive]}
            onPress={() => onSelect(u.borcId, u.kalan)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, selectedBorcId === u.borcId && s.chipTextActive]}>
              {u.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

const s = StyleSheet.create({
  // Yapışık düz görünüm: üstteki satırlarla bitişik, altta ince çizgi
  wrap: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 4,
  },
  chips: {
    gap: 6,
    paddingRight: spacing.md,
  },
  // Kategori öneri chip'leriyle (AmountInputSection.recentChip) birebir aynı standart
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.primary,
  },
});
