import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function GizlilikPolitikasiPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            Gizlilik Politikasi
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            Son Guncelleme: 22 Aralik 2025
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip olarak gizliliginize onem veriyoruz. Bu Gizlilik Politikasi, mobil uygulamamiz araciligiyla toplanan kisisel verilerin hangi amaclarla islendigini, nasil korunduğunu ve kullanicilarin haklarini aciklamaktadir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              1. Toplanan Veriler
            </Text>
            <Text variant="body" style={styles.subTitle}>
              1.1 Kimlik ve Hesap Bilgileri
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              • E-posta adresi{'\n'}
              • Kimlik dogrulama bilgileri (sifreler uygulama gelistiricisi tarafindan gorulmez veya saklanmaz, guvenli kimlik dogrulama altyapilari uzerinden islenir)
            </Text>

            <Text variant="body" style={styles.subTitle}>
              1.2 Kullanici Tarafindan Girilen Icerikler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Asagidaki bilgiler tamamen kullanicinin istegiyle ve manuel olarak girilir:{'\n'}
              • Finansal kayitlar (banka hesaplari, kasa, gelir-gider kayitlari){'\n'}
              • Cari hesap bilgileri (musteri ve tedarikci bilgileri){'\n'}
              • Personel bilgileri{'\n'}
              • Aciklamalar, notlar ve benzeri icerikler
            </Text>

            <Text variant="body" style={styles.subTitle}>
              1.3 Opsiyonel Bilgiler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Vergi numarasi ve benzeri alanlar zorunlu degildir ve kullanici tarafindan istege bagli olarak girilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              2. Verilerin Kullanim Amaclari
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Toplanan veriler asagidaki amaclarla islenir:{'\n\n'}
              • Uygulama fonksiyonlarinin saglanmasi{'\n'}
              • Hesap ve oturum yonetimi{'\n'}
              • Finansal kayit ve raporlarin olusturulmasi{'\n'}
              • Teknik sorunlarin giderilmesi{'\n'}
              • Yasal yukumluluklerin yerine getirilmesi{'\n\n'}
              Veriler reklam, pazarlama veya kullanici takibi amaciyla kullanilmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Verilerin Kullaniciyla Iliskisi (Apple App Store Acisindan)
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              • Kimlik ve hesap bilgileri, kullanici hesabi ile iliskilidir.{'\n'}
              • Kullanici tarafindan girilen finansal kayitlar, cari ve personel bilgileri kullanicinin kendisine degil, kullanicinin hesabi kapsaminda olusturulan iceriklere aittir.{'\n'}
              • Bu veriler yalnizca ilgili kullanici tarafindan erisilebilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Veri Guvenligi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kisisel verilerin guvenligi icin asagidaki onlemler alinmaktadir:{'\n\n'}
              • SSL/TLS ile sifrelenmis veri iletimi{'\n'}
              • Guvenli sunucu altyapilari{'\n'}
              • Yetkilendirme ve erisim kontrol mekanizmalari{'\n'}
              • Yetkisiz erisimi onlemeye yonelik teknik tedbirler
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Ucuncu Taraf Hizmet Saglayicilar
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama asagidaki hizmet saglayicilardan faydalanabilir:{'\n\n'}
              • Kimlik dogrulama servisleri (Apple Kimligi, Google Hesabi){'\n'}
              • Veritabani ve kimlik dogrulama altyapisi (Supabase){'\n'}
              • Bulut barindirma (hosting) hizmetleri{'\n\n'}
              Bu hizmet saglayicilar, verilere yalnizca uygulamanin islevlerini yerine getirebilmek amaciyla ve sinirli olcude erisebilir.{'\n\n'}
              Tum ucuncu taraf hizmet saglayicilar, kullanici verilerine bu Gizlilik Politikasi'nda belirtilen koruma duzeyine esit veya daha yuksek duzede koruma saglamakla yukumludur.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Veri Saklama Suresi ve Hesap Silme
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              • Veriler, kullanici hesabi aktif oldugu surece saklanir.{'\n'}
              • Kullanici, uygulama icinden hesabini silebilir.{'\n'}
              • Hesap silme talebinden sonra 7 gun bekleme suresi uygulanir.{'\n'}
              • Bekleme suresi sonunda hesap ve hesaba bagli tum veriler otomatik olarak kalici sekilde silinir.{'\n'}
              • Apple Kimligi ile giris yapan kullanicilar icin, hesap silme islemi sirasinda Apple kimlik dogrulama token'lari da iptal edilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Cocuklarin Gizliligi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama 13 yas altindaki cocuklara yonelik degildir. Bilerek cocuklara ait kisisel veriler toplanmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              8. Kullanici Haklari
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanicilar, yururlukteki mevzuat kapsaminda:{'\n\n'}
              • Verilerine erisim hakki{'\n'}
              • Duzeltme talep etme hakki{'\n'}
              • Silinmesini isteme hakki{'\n'}
              • Islemeye itiraz etme hakki{'\n\n'}
              haklarina sahiptir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              9. Iletisim
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Gizlilik politikasi ile ilgili sorular icin:{'\n'}
              ozadaliomerfaruk@gmail.com
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  title: {
    marginBottom: spacing.xs,
  },
  date: {
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  subTitle: {
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  paragraph: {
    lineHeight: 22,
  },
});
