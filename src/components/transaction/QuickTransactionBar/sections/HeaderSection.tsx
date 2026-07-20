import { useState, useEffect, Fragment } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar, Bell, X, ArrowRight, CalendarClock } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { HIT_SLOP, fontSize, fontWeight } from '@/constants/spacing';
import { isToday } from '@/lib/date';
import { upperTr } from '@/lib/turkishTextUtils';
import { styles } from '../styles';

// Vade hızlı-seçim preset'leri (gün) — İŞLEM TARİHİNE eklenir (ticari teamül: fatura tarihi + N).
const VADE_PRESET_DAYS = [7, 15, 30] as const;

export interface HeaderSectionProps {
  date: Date;
  isScheduled: boolean;
  formatDateMedium: (date: Date) => string;
  onDatePress: () => void;
  onScheduledToggle: () => void;
  onResetToNow: () => void;
  // Leave usage date range
  isLeaveUsageType?: boolean;
  dateEnd?: Date | null;
  onDateEndPress?: () => void;
  // Vade (ödeme tarihi) — yalnız borç-doğuran (alış/satış) tiplerde gösterilir.
  // İleri-tarihli (Bell) ile AYRI: bu, var olan borcun ödeme vadesi; scheduled değil.
  showVade?: boolean;
  vadeTarihi?: Date | null;
  onVadePress?: () => void;
  onVadeClear?: () => void;
  /** Preset seçimi: işlem tarihi + days → vade. */
  onVadePreset?: (days: number) => void;
}

export function HeaderSection({
  date,
  isScheduled,
  formatDateMedium,
  onDatePress,
  onScheduledToggle,
  onResetToNow,
  isLeaveUsageType,
  dateEnd,
  onDateEndPress,
  showVade,
  vadeTarihi,
  onVadePress,
  onVadeClear,
  onVadePreset,
}: HeaderSectionProps) {
  const { t } = useTranslation(['transactions', 'common', 'staff']);
  const dateIsToday = isToday(date);

  // Vade dropdown'ı: segmente basınca barın altında 7|15|30|SEÇ satırı açılır.
  const [vadeMenuOpen, setVadeMenuOpen] = useState(false);

  // Tip değişimi / ileri-tarihli toggle'ı vade segmentini gizlerse menü açık kalmasın.
  useEffect(() => {
    if (!showVade && vadeMenuOpen) setVadeMenuOpen(false);
  }, [showVade, vadeMenuOpen]);

  return (
    <>
      {/* Scheduled transaction label */}
      {isScheduled && (
        <View style={styles.scheduledLabel}>
          <Bell size={14} color={colors.warning} />
          <Text style={styles.scheduledLabelText}>{t('transactions:scheduled.title')}</Text>
        </View>
      )}

      {/* Zaman satırı — tek düz bar: tarih │ zil │ vade (segmentler arası dikey çizgi); ✕ kartın dışında */}
      <View style={styles.headerRow}>
        {isLeaveUsageType ? (
          /* İzin kullanımı: çift tarih (başlangıç → bitiş) */
          <View style={styles.dateRangeRow}>
            <TouchableOpacity style={[styles.dateButton, { marginRight: 0 }]} onPress={onDatePress}>
              <Calendar size={16} color={colors.textMuted} />
              <Text style={styles.dateText} numberOfLines={1}>
                {dateIsToday ? t('common:date.today') : formatDateMedium(date)}
              </Text>
            </TouchableOpacity>
            <ArrowRight size={14} color={colors.textMuted} />
            <TouchableOpacity style={[styles.dateButton, { marginRight: 0 }]} onPress={onDateEndPress}>
              <Calendar size={16} color={colors.textMuted} />
              <Text style={styles.dateText} numberOfLines={1}>
                {dateEnd
                  ? isToday(dateEnd)
                    ? t('common:date.today')
                    : formatDateMedium(dateEnd)
                  : t('staff:leave.endDate')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Normal: tek düz bar — segmentler arası dikey çizgi, ayrı buton görünümü yok */
          <View style={local.flatBar}>
            {/* İşlem tarihi */}
            <TouchableOpacity style={local.segment} onPress={onDatePress} activeOpacity={0.6}>
              <Calendar size={20} color={isScheduled ? colors.warning : colors.textMuted} />
              <Text
                style={[local.segmentText, isScheduled && { color: colors.warning }]}
                numberOfLines={1}
              >
                {dateIsToday ? t('common:date.today') : formatDateMedium(date)}
              </Text>
              {/* Tarih ≠ bugün iken segment içinde X → basınca bugüne döner */}
              {!dateIsToday && (
                <TouchableOpacity onPress={onResetToNow} hitSlop={HIT_SLOP.sm} style={local.segClear}>
                  <X size={18} color={isScheduled ? colors.warning : colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <View style={local.divider} />

            {/* İleri-tarihli (scheduled) toggle */}
            <TouchableOpacity style={local.segmentIcon} onPress={onScheduledToggle} activeOpacity={0.6}>
              <Bell size={20} color={isScheduled ? colors.warning : colors.textMuted} />
            </TouchableOpacity>

            {/* Vade — yalnız alış/satış; boş="Vade", dolu=tarih (yeşil + temizle X segment içinde).
                Basınca picker değil, altta 7|15|30|SEÇ hızlı-seçim satırı açılır. */}
            {showVade && (
              <>
                <View style={local.divider} />
                <TouchableOpacity
                  style={local.segment}
                  onPress={() => setVadeMenuOpen((v) => !v)}
                  activeOpacity={0.6}
                >
                  <CalendarClock size={20} color={vadeTarihi ? colors.primary : colors.textMuted} />
                  <Text
                    style={[local.segmentText, vadeTarihi ? { color: colors.primary } : null]}
                    numberOfLines={1}
                  >
                    {vadeTarihi ? formatDateMedium(vadeTarihi) : t('transactions:vade.label')}
                  </Text>
                  {vadeTarihi && onVadeClear ? (
                    <TouchableOpacity onPress={onVadeClear} hitSlop={HIT_SLOP.sm} style={local.segClear}>
                      <X size={18} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Vade hızlı-seçim dropdown'ı — üstteki barla aynı görsel dil (segment + dikey çizgi).
          Preset işlem tarihine eklenir; SEÇ mevcut takvim picker'ını açar. */}
      {showVade && vadeMenuOpen && (
        <View style={local.vadeMenuBar}>
          {VADE_PRESET_DAYS.map((d) => (
            <Fragment key={d}>
              <TouchableOpacity
                style={local.vadeMenuItem}
                onPress={() => {
                  setVadeMenuOpen(false);
                  onVadePreset?.(d);
                }}
                activeOpacity={0.6}
              >
                <Text style={local.vadeMenuText}>{t('transactions:vade.days', { d })}</Text>
              </TouchableOpacity>
              <View style={local.divider} />
            </Fragment>
          ))}
          <TouchableOpacity
            style={local.vadeMenuItem}
            onPress={() => {
              setVadeMenuOpen(false);
              onVadePress?.();
            }}
            activeOpacity={0.6}
          >
            <Calendar size={16} color={colors.primary} />
            <Text style={[local.vadeMenuText, { color: colors.primary }]}>
              {upperTr(t('transactions:vade.pick'))}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const local = StyleSheet.create({
  flatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.background,
    flexShrink: 1,
    overflow: 'hidden',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: '100%',
    flexShrink: 1,
  },
  segmentIcon: {
    height: '100%',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: colors.border,
  },
  segClear: {
    paddingLeft: 2,
  },
  segmentText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  vadeMenuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.background,
    overflow: 'hidden',
    marginTop: -6,
    marginBottom: 12,
  },
  vadeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: '100%',
  },
  vadeMenuText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
});
