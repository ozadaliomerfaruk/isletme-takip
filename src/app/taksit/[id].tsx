import { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CalendarClock, Share2 } from 'lucide-react-native';
import { Text, Button, EmptyState } from '@/components/ui';
import { QuickTransactionBar } from '@/components/transaction/QuickTransactionBar';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { formatCurrency } from '@/lib/currency';
import { formatDateShort } from '@/lib/date';
import { useTaksitPlanDetay, type TaksitSatirDetay } from '@/hooks/useTaksit';
import { useRetahsisOdeme } from '@/hooks/useIslemTahsis';
import { useAuthContext } from '@/contexts/AuthContext';
import { exportTaksitPlaniToPdf } from '@/lib/taksitPlanPdf';

/**
 * Taksit detayı (Faz 3): taksit satırları + tahsis-bazlı ödendi/kalan durumu.
 * "Tahsil Et/Öde" → en eski açık taksitin kalanı ön-dolu QTB (FIFO sunucuda —
 * ödeme zaten en eski vadeye gider, hedef seçtirmeye gerek yok).
 * Tüm meta (para birimi, cari, tip) detay sorgusunun KENDİSİNDEN gelir —
 * deep-link/soğuk açılışta liste sorgusu beklenmez.
 */
export default function TaksitDetayPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation(['transactions', 'common']);
  const { data: detay, isLoading, refetch, isRefetching } = useTaksitPlanDetay(id);
  const retahsis = useRetahsisOdeme();
  const { isletme } = useAuthContext();

  const [tahsilVisible, setTahsilVisible] = useState(false);
  const [pdfSharing, setPdfSharing] = useState(false);

  const bugunStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const ilkAcik = useMemo(
    () => detay?.taksitler.find((tk) => tk.kalan > 0) ?? null,
    [detay],
  );

  const odenenAdet = useMemo(
    () => (detay?.taksitler ?? []).filter((tk) => tk.kalan <= 0).length,
    [detay],
  );

  const currency = detay?.currency ?? 'TRY';

  // Ödeme Planı PDF'i — müşteriye/tedarikçiye gönderilecek plan dökümü
  const handleSharePdf = useCallback(async () => {
    if (!detay || pdfSharing) return;
    setPdfSharing(true);
    try {
      const fmt = (iso: string) => {
        const p = iso.split('-');
        return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
      };
      await exportTaksitPlaniToPdf({
        isletmeName: isletme?.name ?? '',
        cariName: detay.cariName ?? t('transactions:taksit.detayTitle'),
        currency,
        satirlar: detay.taksitler.map((tk) => ({
          sira: tk.sira,
          vadeTarihi: fmt(tk.vade_tarihi),
          tutar: tk.tutar,
          odenen: tk.odenen,
          kalan: tk.kalan,
          durum: tk.kalan <= 0 ? 'odendi' : tk.vade_tarihi <= bugunStr ? 'gecikmis' : 'acik',
        })),
        toplam: detay.toplam,
        odenen: detay.odenen,
        labels: {
          baslik: t('transactions:taksit.pdfBaslik'),
          sira: t('transactions:taksit.label'),
          vade: t('transactions:vade.label'),
          tutar: t('transactions:taksit.pdfTutar'),
          odenen: t('transactions:taksit.pdfToplamOdenen'),
          kalan: t('transactions:vade.kalan'),
          durum: t('transactions:taksit.pdfDurum'),
          odendi: t('transactions:taksit.pdfOdendi'),
          gecikmis: t('transactions:taksit.pdfGecikmis'),
          acik: t('transactions:taksit.pdfAcik'),
          genelToplam: t('transactions:taksit.pdfGenelToplam'),
          toplamOdenen: t('transactions:taksit.pdfToplamOdenen'),
          toplamKalan: t('transactions:taksit.pdfToplamKalan'),
          olusturulma: t('transactions:taksit.pdfOlusturulma'),
        },
        fileName: `Taksit_Plani_${(detay.cariName ?? 'plan').replace(/[^\p{L}\p{N}]+/gu, '_')}`,
        shareDialogTitle: t('transactions:taksit.pdfPaylas'),
        sharingNotSupported: t('transactions:taksit.pdfPaylasilamiyor'),
      });
    } catch (e) {
      Alert.alert(t('common:status.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setPdfSharing(false);
    }
  }, [detay, pdfSharing, isletme?.name, currency, bugunStr, t]);

  const renderItem = ({ item }: { item: TaksitSatirDetay }) => {
    const odendi = item.kalan <= 0;
    const gecikmis = !odendi && item.vade_tarihi <= bugunStr;
    const gecikmeGun = gecikmis
      ? Math.max(1, Math.round(
          (new Date(bugunStr).getTime() - new Date(item.vade_tarihi).getTime()) / 86400000
        ))
      : 0;
    const ilkAcikMi = !odendi && ilkAcik?.id === item.id;
    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Text variant="body" style={styles.siraText} numberOfLines={1}>
            {t('transactions:taksit.siraLabel', { sira: item.sira })}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {t('transactions:vade.label')}: {formatDateShort(item.vade_tarihi)}
          </Text>
          {gecikmis && (
            <Text variant="caption" style={styles.gecikmis} numberOfLines={1}>
              {t('transactions:vade.gunGecikti', { gun: gecikmeGun })}
            </Text>
          )}
        </View>
        <View style={styles.rowRight}>
          <Text variant="body" style={styles.tutarText} numberOfLines={1}>
            {formatCurrency(item.tutar, currency)}
          </Text>
          {odendi ? (
            <View style={styles.durumRow}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text variant="caption" color="success">{t('transactions:taksit.tamamlandi')}</Text>
            </View>
          ) : (
            <Text variant="caption" style={gecikmis ? styles.gecikmis : styles.kalanText} numberOfLines={1}>
              {t('transactions:vade.kalan')}: {formatCurrency(item.kalan, currency)}
            </Text>
          )}
          {/* Sıradaki (en eski açık) taksite satır-içi hızlı tahsilat — FIFO ilkesi
              gereği yalnız ilk açık taksitte gösterilir (aradaki taksite basılıp
              paranın yine en eskiye gitmesi kafa karıştırırdı) */}
          {ilkAcikMi && detay?.type && (
            <TouchableOpacity
              style={styles.satirTahsilBtn}
              activeOpacity={0.8}
              onPress={() => setTahsilVisible(true)}
            >
              <Text style={styles.satirTahsilText}>
                {detay.type === 'cari_satis' ? t('transactions:vade.tahsilEt') : t('transactions:vade.ode')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: detay?.cariName ?? t('transactions:taksit.detayTitle'),
          // Ödeme Planı PDF paylaşımı — plan yüklüyse aktif
          headerRight: detay
            ? () => (
                <TouchableOpacity onPress={handleSharePdf} disabled={pdfSharing} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  {pdfSharing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Share2 size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Özet başlık */}
        {detay && (
          <View style={styles.summary}>
            <CalendarClock size={18} color={colors.textMuted} />
            <Text variant="body" style={styles.summaryText}>
              {formatCurrency(detay.odenen, currency)} / {formatCurrency(detay.toplam, currency)}
              {'  ·  '}
              {t('transactions:taksit.odenenOran', { odenen: odenenAdet, toplam: detay.taksitler.length })}
            </Text>
          </View>
        )}

        <FlatList
          data={detay?.taksitler ?? []}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
            ) : (
              <EmptyState
                icon={<CalendarClock size={44} color={colors.textMuted} />}
                title={t('transactions:taksit.bos')}
              />
            )
          }
        />

        {/* Tahsil Et / Öde — açık taksit varsa */}
        {detay?.type && ilkAcik && (
          <View style={styles.footer}>
            <Button onPress={() => setTahsilVisible(true)} fullWidth>
              {`${detay.type === 'cari_satis' ? t('transactions:vade.tahsilEt') : t('transactions:vade.ode')} · ${formatCurrency(ilkAcik.kalan, currency)}`}
            </Button>
          </View>
        )}

        {detay?.type && detay.cariId && (
          <QuickTransactionBar
            visible={tahsilVisible}
            onDismiss={() => setTahsilVisible(false)}
            defaultCariId={detay.cariId}
            defaultCariType={detay.type === 'cari_satis' ? 'musteri' : 'tedarikci'}
            defaultType={detay.type === 'cari_satis' ? 'tahsilat' : 'odeme'}
            defaultAmount={ilkAcik?.kalan}
            onSuccess={(islemId) => {
              setTahsilVisible(false);
              // Bağlam-hedefli tahsis: bu ekrandan yapılan tahsilat BU planın en eski
              // açık taksitine gitsin. Genel FIFO carinin BAŞKA borcunun daha eski
              // vadesine kaydırabiliyor (kullanıcı bulgusu) — retahsis hedefe çevirir.
              if (islemId && detay?.islemId) {
                retahsis.mutate({ odemeIslemId: islemId, hedefBorcId: detay.islemId });
              }
            }}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  summaryText: {
    fontWeight: '600',
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
  },
  loader: {
    marginTop: spacing['3xl'],
  },
  // Yapışık düz-liste görünümü (cariler dili): kutu değil satır
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  rowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  siraText: {
    fontWeight: '600',
    marginBottom: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: '60%',
  },
  tutarText: {
    fontWeight: '700',
    marginBottom: 2,
  },
  durumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kalanText: {
    color: colors.warning,
    fontWeight: '600',
  },
  gecikmis: {
    color: colors.error,
    fontWeight: '700',
  },
  satirTahsilBtn: {
    marginTop: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  satirTahsilText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
});
