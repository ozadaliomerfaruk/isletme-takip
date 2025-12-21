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
              Son guncelleme: 20 Aralik 2024
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
                Isletme Takip, kucuk ve orta olcekli isletmeler icin gelistirilmis bir finansal yonetim uygulamasidir. Uygulama, gelir-gider takibi, cari hesap yonetimi, personel bordro takibi ve finansal raporlama hizmetleri sunmaktadir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                2. Kullanici Sorumlulugu
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kullanici, uygulamaya girdigi tum verilerin dogrulugu ve guncelligi konusunda sorumluluk tasir. Yanlis veya eksik veri girisinden kaynaklanan sorunlardan Isletme Takip sorumlu tutulamaz.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                3. Hesap Guvenligi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kullanici, hesap bilgilerini gizli tutmak ve yetkisiz erisimi onlemekle yukumludur. Hesabinizda gerceklesen tum islemlerden siz sorumlusunuz.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                4. Veri Guvenligi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Verileriniz guvenli sunucularda sifrelenerek saklanmaktadir. Ancak internet uzerinden yapilan hicbir veri iletiminin %100 guvenli olmadigini kabul edersiniz.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                5. Hizmet Degisiklikleri
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Isletme Takip, hizmet icerigini, ozelliklerini ve fiyatlandirmasini onceden bildirimde bulunmaksizin degistirme hakkini sakli tutar.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                6. Sorumluluk Siniri
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Isletme Takip, uygulamanin kullanimindan kaynaklanan dogrudan veya dolayli zararlardan sorumlu tutulamaz. Uygulama "oldugu gibi" sunulmaktadir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                7. Uyusmazlik Cozumu
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Bu kosullardan dogan uyusmazliklarda Turkiye Cumhuriyeti kanunlari uygulanir ve Istanbul Mahkemeleri yetkilidir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                8. Iletisim
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kullanim kosullari hakkinda sorulariniz icin destek@business-tracker.app adresinden bize ulasabilirsiniz.
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
