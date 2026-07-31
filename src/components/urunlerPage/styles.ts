import { StyleSheet } from 'react-native';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Alt boşluk BURADA DEĞİL: tek tüketicisi olan urunler/index.tsx inline
  // paddingBottom (useContentBottomPadding) veriyor ve buradaki sabit değeri
  // eziyordu — ölü değerdi. Sabit 32+80, cam tab bar'ın gerçek payını (insets.bottom
  // override'lı, ~106) hiçbir zaman karşılamıyordu; iki kaynak olması da
  // "hangisi geçerli?" tuzağıydı.
  flatListContent: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // sortButton → GlassIconButton'a taşındı.
  searchSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  tabSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  periodSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  // Gezinme + Miktar/Tutar toggle'ı tek satırda: sol gezinme, sağ toggle
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  // flex:1 + space-between: gezinme, toggle'a kadar olan alana YAYILIR
  // (oklar uçlarda, etiket ortada — dokunması kolay)
  periodNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    flexShrink: 1,
  },
  // Yuvarlak zeminli ok — dokunma hedefi belirgin ve rahat
  periodNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabelBtn: {
    flexShrink: 1,
  },
  periodLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
  customDateRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexShrink: 1,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.md,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerWrapper: {
    alignItems: 'center',
  },
  listSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  yearGridCell: {
    width: '23%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearGridCellActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearGridTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  yearScrollView: {
    marginBottom: spacing.lg,
  },
  yearScrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  yearChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  yearChipText: {
    color: colors.text,
  },
  yearChipTextActive: {
    color: colors.surface,
    fontWeight: '600',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  monthCell: {
    width: '31%',
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warningSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    borderWidth: 1,
    borderColor: colors.warning + '40',
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
    color: colors.text,
  },
  /** Yalnız KONUM — boyut/görsel GlassFab'de (cam vs dolu disk orada ayrışır). */
  fab: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  fabMenuContainer: {
    position: 'absolute',
    right: spacing.lg,
    alignItems: 'flex-end',
    gap: spacing.sm,
    zIndex: 9,
  },
  // fabMenuItem / fabMenuIcon / fabMenuLabel → GlassFabMenuItem'a taşındı.
});
