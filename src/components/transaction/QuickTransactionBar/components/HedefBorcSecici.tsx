import { memo, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { formatCurrency, roundCurrency, toNumber } from '@/lib/currency';
import { useDateFormat } from '@/hooks/useDateFormat';
import { useCariVadeliBorclar, useCariTahsisOzeti } from '@/hooks/useIslemTahsis';
import { useCariTaksitBirimleri } from '@/hooks/useTaksit';
import { SegmentSelect } from './SegmentSelect';

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
    // TabFilter imzası: gri ray + kayan dolu pill (SegmentSelect). Etiket solda,
    // ray kalan genişliği alır; standart satır gibi altta çizgi.
    <View style={s.wrap}>
      <Text style={s.label}>{t('transactions:vade.hedefBaslik')}</Text>
      <View style={s.trackWrap}>
        <SegmentSelect
          options={[
            { key: AUTO_KEY, label: t('transactions:vade.hedefOtomatik') },
            ...units.map((u) => ({ key: u.borcId, label: u.label })),
          ]}
          selectedKey={selectedBorcId ?? AUTO_KEY}
          onSelect={(key) => {
            if (key === AUTO_KEY) {
              onSelect(null);
            } else {
              const u = units.find((x) => x.borcId === key);
              onSelect(key, u?.kalan);
            }
          }}
        />
      </View>
    </View>
  );
});

const AUTO_KEY = '__otomatik__';

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  trackWrap: {
    flex: 1,
  },
});
