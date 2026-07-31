import { type ReactNode, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { Text } from './Text';
import { GlassContainer, GlassSurface, GLASS_MERGE_SPACING, withAlpha } from './GlassSurface';
import { colors } from '@/constants/colors';
import { spacing, HIT_SLOP } from '@/constants/spacing';
import { upperTr } from '@/lib/turkishTextUtils';

/**
 * Cam nav bar'ın tint'i — AYAR DÜĞMESİ. `HEADER_GLASS_STYLE` ile birlikte ayarlanır.
 *
 * NEDEN TİNT GEREKİYOR (ve WhatsApp'ta gerekmiyor): cam arkasındaki rengi
 * örnekler. WhatsApp KOYU tema — açık cam koyu içerikten kendiliğinden ayrışır,
 * o yüzden tint'siz haliyle o kadar saydam durabiliyor. Bizim zeminimiz #F5F5F5
 * ve kartlar beyaz; tint'siz cam da beyaza yakın çıkıyor ve yüzey KAYBOLUYOR
 * (denendi: header hiç görünmedi). Bu bir tercih değil, malzemenin fiziği.
 *
 * TİNT ZEMİNDEN DAHA KOYU — kasıtlı, ve sırayla şu iki deneme sonucunda:
 *
 *  1. Beyaz tint: header sayfadan belirgin AÇIK çıktı, aralarında çizgi gibi
 *     bir sınır oluştu. Beklenen — beyaz zaten beyaza kaldırıyor.
 *  2. Zeminin kendi rengi (#F5F5F5): hâlâ beyaz göründü. Çünkü işlem sırası
 *     "örnekle → MALZEMEYİ UYGULA → tint". Açık modda malzeme zemini beyaza
 *     doğru kaldırıyor; zeminle aynı renkte bir tint bu kaldırmayı geri
 *     çekemiyor, yalnız daha fazla kaldırmıyor.
 *
 * Doğru çözüm tint'i kaldırılan miktar kadar KOYU seçmek: #E8E8E8 (zemin
 * #F5F5F5'ten bir tık koyu) malzemenin parlamasını dengeleyip sonucu sayfa
 * rengine indiriyor. Böylece diğer sekme ekranlarının opak header'larıyla
 * aynı tonda duruyor ve ayırıcı çizgi kalmıyor.
 *
 * ⚠️ ALFANIN BEDELİ VAR (önceki notta yanlış yazılmıştı): malzeme tint'ten
 * ÖNCE uygulandığı için alfa dinlenme halinde de sonucu değiştiriyor. Alfa
 * bu düzeltmenin gücü — yükseldikçe renk sayfaya daha çok oturur ama cam
 * saydamlığını kaybeder. 0.45 iki isteği dengeleyen nokta.
 *
 * KALİBRASYON (cihazda, adım adım): #E8E8E8 → hâlâ beyaz · #E0E0E0 → hâlâ bir
 * tık beyaz · #D0D0D0 → mevcut. Malzemenin açık moddaki parlaması beklenenden
 * güçlü çıktı, o yüzden tint zeminden (#F5F5F5) epey koyu olmak zorunda kaldı.
 *
 * DİLLER:
 *  • Hâlâ beyaza çalıyorsa → koyulaştırmaya devam (#D0D0D0 → #C8C8C8)
 *  • Bu sefer griye kaçtıysa → #D8D8D8
 *  • Renk tuttu ama cam ölü göründüyse → alfayı düşür (0.45 → 0.35).
 *    DİKKAT: alfa düşünce düzeltme zayıflar ve renk yeniden beyaza kayar —
 *    ikisi bağımsız değil, alfayı oynatırsan tonu da yeniden bakman gerekir.
 *
 * SCROLL-0'DA DÜZ GÖRÜNMESİ NORMAL: arkasında örneklenecek içerik yok.
 * Kaydırınca satırlar altına girdikçe malzeme belirir — iOS nav bar'ının
 * kendi davranışı bu.
 */
const HEADER_TINT = withAlpha('#D0D0D0', 0.45);

/**
 * 'clear' = ince malzeme, arkasını daha çok gösterir (WhatsApp'takine yakın his).
 * 'regular' = standart cam, daha kapalı ama açık zeminde daha garantili okunur.
 */
const HEADER_GLASS_STYLE = 'clear' as const;

/**
 * İlk karede listeye verilecek üst boşluk tahmini (cam modda) — ÇENTİK HARİÇ.
 * Çağıran `insets.top + TAB_HEADER_ESTIMATED_HEIGHT` şeklinde kullanır; çentik
 * cihaza göre değiştiği için sabite gömülemez.
 *
 * `onHeightChange` ilk layout'ta gerçek ölçüyle değiştirir; bu sabit yalnız o
 * ilk kareyi sıçramasız geçirmek için var.
 */
export const TAB_HEADER_ESTIMATED_HEIGHT = 56;

interface TabHeaderProps {
  /** Sol taraftaki başlık (ekran adı veya işletme adı). */
  title: string;
  /** Başlığın altındaki opsiyonel ikinci satır (ör. "12 personel"). */
  subtitle?: string;
  /** Sağ taraftaki aksiyonlar (arama, sıralama, AddEntityButton…). */
  right?: ReactNode;
  /** Verilirse başlık tıklanabilir olur (ör. işletme değiştir) — yanında chevron çıkar. */
  onTitlePress?: () => void;
  /**
   * iOS 26 cam nav bar (PİLOT — şu an yalnız Personel).
   *
   * Açıkken header akıştan ÇIKAR ve içeriğin üstünde yüzer; liste onun
   * ARKASINDAN akar. Bu, camın çalışması için şart — arkasında örnekleyecek
   * içerik yoksa cam düz bir şeride döner (bkz. Screen.tsx'teki aynı kural).
   *
   * ÇAĞIRANIN SORUMLULUĞU:
   *  • `<Screen>` — `top` VERİLMEZ. Üst safe-area boşluğunu header kendisi taşır
   *    (bkz. bileşen içindeki insets notu); `<Screen top>` ile birlikte
   *    kullanılırsa boşluk iki kez sayılır.
   *  • Listenin `contentContainerStyle.paddingTop`'u `onHeightChange`'ten gelen
   *    değere eşitlenir — header yer kaplamadığı için içerik onun altında başlar.
   *  • Header liste ile AYNI ebeveynde ve listeden SONRA render edilir (üstte
   *    boyansın diye). zIndex vermiyoruz: sonraki kardeşler (FAB perdesi, menü)
   *    header'ın üstünde kalsın.
   */
  glass?: boolean;
  /** Cam modda ölçülen header yüksekliği — listenin üst boşluğu buna eşitlenir. */
  onHeightChange?: (height: number) => void;
}

/**
 * Tüm tab ekranlarının en üstündeki SABİT (sticky) header satırı.
 *
 * Scroll-container'ın DIŞINA konur → kaydırınca en üstte yapışık kalır (#3).
 * Sabit yükseklik/padding → her sayfada aynı boyut (#2).
 *
 * `glass` AÇIKSA bu değişir: header akıştan çıkar, içeriğin üstünde yüzer ve
 * liste arkasından akar (bkz. `glass` prop'u). Yapışıklık aynı kalır — artık
 * scroll'un dışında olduğu için değil, üstünde olduğu için.
 */
export function TabHeader({ title, subtitle, right, onTitlePress, glass, onHeightChange }: TabHeaderProps) {
  // ÜST BOŞLUK CAM MODDA HEADER'IN KENDİSİNE AİT — çağıran `<Screen top>` DEMEZ.
  //
  // Neden: Yoga mutlak konumlu çocuğu ebeveynin PADDING kutusuna göre değil KENAR
  // kutusuna göre yerleştiriyor. `<Screen top>` + `top: 0` denendi ve header
  // çentiğin içine, saat/pil hizasına oturdu. Boşluğu header taşıyınca konum
  // tek yerde ve tartışmasız oluyor — ayrıca liste çentiğin de altından akar,
  // native nav bar'ın gerçek davranışı zaten bu.
  const insets = useSafeAreaInsets();

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onHeightChange?.(e.nativeEvent.layout.height),
    [onHeightChange]
  );

  const titleBlock = (
    <>
      <View style={styles.titleRow}>
        <Text variant="h2" numberOfLines={1} style={styles.titleText}>{upperTr(title)}</Text>
        {onTitlePress ? <ChevronDown size={18} color={colors.textMuted} /> : null}
      </View>
      {subtitle ? (
        <Text variant="caption" color="secondary" numberOfLines={1}>{subtitle}</Text>
      ) : null}
    </>
  );

  return (
    <View
      style={[
        styles.header,
        glass ? [styles.headerGlass, { paddingTop: insets.top + spacing.xs }] : styles.headerOpaque,
      ]}
      onLayout={glass ? handleLayout : undefined}
    >
      {/* Cam KATMAN, içeriğin arkasında (tab bar ile aynı desen: cam absoluteFill,
          içerik kardeş). Üstüne düz katman/gölge/border YOK — rim lighting'i
          perdeler. interactive={false}: bu bir buton değil, başlığa dokununca
          camın kabarması yanlış olur. */}
      {glass ? (
        <GlassSurface
          style={StyleSheet.absoluteFill}
          fallbackStyle={styles.headerFallback}
          glassStyle={HEADER_GLASS_STYLE}
          tintColor={HEADER_TINT}
          interactive={false}
        />
      ) : null}
      {onTitlePress ? (
        <TouchableOpacity
          style={styles.left}
          onPress={onTitlePress}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP.sm}
          accessibilityRole="button"
        >
          {titleBlock}
        </TouchableOpacity>
      ) : (
        <View style={styles.left}>{titleBlock}</View>
      )}
      {/**
        * Sağ aksiyon grubu GlassContainer: yan yana duran CAM butonlar
        * birbirine erir ve tek kapsül olur (Apple'ın ToolbarItemGroup dili).
        * Kaldıraç markup değil BOŞLUK: styles.right'ın gap'i spacing.sm = 8 ve
        * 8 < GLASS_MERGE_SPACING (10) → erirler. Bir butonu gruptan AYIRMAK
        * istersen aradaki boşluğu spacing.md = 12'ye çıkar (12 > 10 → ayrı kalır).
        *
        * AddEntityButton (+EKLE) cam olmadığı için erimeye katılmaz, kendiliğinden
        * ayrı durur — ama container'ın İÇİNDE kalmalı, dışarı alınırsa hizalama bozulur.
        */}
      {right ? (
        <GlassContainer spacing={GLASS_MERGE_SPACING} style={styles.right}>
          {right}
        </GlassContainer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    minHeight: 44,
  },
  /** Bugünkü görünüm: akış içinde, opak, altında saç teli çizgi. */
  headerOpaque: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  /**
   * Cam mod: akıştan çıkar, içeriğin üstünde yüzer. `top: 0` = EKRANIN tepesi
   * (Yoga mutlak çocuğu ebeveynin padding'ine göre kaydırmıyor) → çentik boşluğu
   * header'ın kendi paddingTop'una ekleniyor. zIndex YOK — bkz. `glass` prop'u.
   */
  headerGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  /** Cam YOKKEN (iOS<26 / Android) cam katmanın yerine geçen opak zemin. */
  headerFallback: {
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    /**
     * GRUP-İÇİ BOŞLUK — erimeyi de nefes payını da bu belirliyor.
     *
     * spacing.sm = 8: butonlar 36px olduğundan ikon merkezleri 44px arayla
     * düşer (Apple'ın native toolbar grubunda ~44-48). Eskiden spacing.xs = 4
     * idi, merkezler 40px'e iniyordu ve grup sıkışık okunuyordu.
     *
     * 8 < GLASS_MERGE_SPACING (10) → cam butonlar hâlâ tek kapsüle erir.
     * Bu değer 9'u GEÇEMEZ; daha fazla nefes gerekiyorsa doğru kaldıraç gap
     * değil buton çapıdır (36 → 40, minHeight 44'e sığar) — o zaman erime
     * matematiğine hiç dokunulmaz.
     */
    gap: spacing.sm,
  },
});
