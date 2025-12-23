import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function KullanimKosullariPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            Kullanim Kosullari
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            Son Guncelleme: 22 Aralik 2025
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip uygulamasini kullanarak asagidaki kosullari kabul etmis sayilirsiniz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              1. Hizmet Tanimi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip, kucuk ve orta olcekli isletmeler icin gelistirilmis bir finansal takip ve yonetim uygulamasidir. Uygulama; gelir-gider takibi, cari hesap yonetimi, personel kayit ve odeme takibi ile finansal raporlama araclari sunar.{'\n\n'}Uygulama, resmi muhasebe, bordro, vergi veya hukuki danismanlik hizmeti sunmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              2. Kullanim Sartlari ve Yas Siniri
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Bu uygulamayi kullanabilmek icin en az 13 yasinda olmaniz gerekmektedir. 13 yasindan kucuk bireylerin uygulamayi kullanmasi yasaktir.{'\n\n'}Kullanici, uygulamaya girdigi tum verilerin dogrulugu, guncelligi ve mevzuata uygunlugundan sorumludur. Yanlis veya eksik veri girisinden kaynaklanan sonuclardan Isletme Takip sorumlu tutulamaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Hesap Guvenligi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanici, hesap bilgilerini gizli tutmak ve yetkisiz erisimi onlemekle yukumludur. Hesap uzerinden gerceklestirilen tum islemlerden kullanici sorumludur.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Veri Guvenligi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanici verileri, guvenli sunucular uzerinde ve makul teknik guvenlik onlemleri uygulanarak saklanir. Bununla birlikte, internet uzerinden gerceklestirilen veri iletimlerinin tamamen risksiz olmadigi kabul edilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Hesap Silme
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanici, hesabini uygulama icerisindeki Ayarlar {'>'} Hesabimi Sil menusu uzerinden silebilir. Hesap silme talebi sonrasinda 7 gunluk bekleme suresi uygulanir. Bu sure icerisinde kullanici silme islemini iptal edebilir. Bekleme suresinin sonunda hesap ve hesaba bagli tum veriler kalici olarak silinir ve geri alinamaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Ucuncu Taraf Hizmetler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama, kimlik dogrulama amaciyla Apple Kimligi ve Google Hesabi gibi ucuncu taraf hizmetleri kullanabilir. Bu hizmetlerin kullanimi, ilgili hizmet saglayicilarin kendi kullanim kosullarina tabidir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Hizmet Degisiklikleri
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip, uygulamanin hizmet icerigini, ozelliklerini ve fiyatlandirmasini onceden bildirimde bulunmaksizin degistirme hakkini sakli tutar.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              8. Fikri Mulkiyet
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip uygulamasinin tasarimi, yazilimi ve marka unsurlari Isletme Takip'e aittir. Kullanici tarafindan uygulamaya girilen tum verilerin mulkiyeti kullaniciya aittir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              9. Sorumlulugun Sinirlandirilmasi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Isletme Takip, uygulamanin kullanimindan dogabilecek dolayli zararlardan sorumlu tutulamaz. Uygulama, mevcut haliyle ("oldugu gibi") sunulmaktadir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              10. Uyusmazliklarin Cozumu
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Bu kullanim kosullarindan dogabilecek uyusmazliklarda Turkiye Cumhuriyeti hukuku uygulanir ve Istanbul Mahkemeleri yetkilidir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              11. Iletisim
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanim kosullari ile ilgili sorulariniz icin:{'\n'}ozadaliomerfaruk@gmail.com
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
  paragraph: {
    lineHeight: 22,
  },
});
