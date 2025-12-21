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
              Son guncelleme: 20 Aralik 2024
            </Text>

            <View style={styles.section}>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Isletme Takip olarak gizliliginize onem veriyoruz. Bu politika, kisisel verilerinizi nasil topladigimizi, kullandigimizi ve korudugumuzu aciklamaktadir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                1. Toplanan Veriler
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Uygulamamiz asagidaki verileri toplamaktadir:{'\n\n'}
                • Hesap bilgileri (e-posta, sifre){'\n'}
                • Isletme bilgileri (isletme adi, iletisim){'\n'}
                • Finansal veriler (gelir, gider, hesap hareketleri){'\n'}
                • Cari hesap bilgileri{'\n'}
                • Personel bilgileri
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                2. Verilerin Kullanimi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Topladigi̇mi̇z verileri asagidaki amaclarla kullaniyoruz:{'\n\n'}
                • Uygulama hizmetlerinin sunulmasi{'\n'}
                • Finansal raporlarin olusturulmasi{'\n'}
                • Kullanici deneyiminin iyilestirilmesi{'\n'}
                • Teknik sorunlarin giderilmesi{'\n'}
                • Yasal yukumluluklerin yerine getirilmesi
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                3. Veri Guvenligi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Verilerinizi korumak icin endustri standartlarinda guvenlik onlemleri uyguluyoruz:{'\n\n'}
                • SSL/TLS sifreleme{'\n'}
                • Guvenli veri merkezleri{'\n'}
                • Duzenli guvenlik denetimleri{'\n'}
                • Erisim kontrolu ve yetkilendirme
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                4. Veri Paylasimi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kisisel verilerinizi ucuncu taraflarla paylasmiyoruz. Ancak asagidaki durumlarda paylasim gerekebilir:{'\n\n'}
                • Yasal zorunluluklar{'\n'}
                • Mahkeme kararlari{'\n'}
                • Kullanicinin acik rizasi
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                5. Cerezler
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Uygulamamiz oturum yonetimi ve kullanici deneyimini iyilestirmek icin cerezler kullanmaktadir. Cerezleri tarayici ayarlarinizdan yonetebilirsiniz.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                6. Veri Saklama Suresi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Verileriniz hesabiniz aktif oldugu surece saklanir. Hesabinizi sildiginizde verileriniz 30 gun icinde kalici olarak silinir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                7. Haklariniz
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                KVKK kapsaminda asagidaki haklara sahipsiniz:{'\n\n'}
                • Verilerinize erisim hakki{'\n'}
                • Verilerin duzeltilmesini talep hakki{'\n'}
                • Verilerin silinmesini talep hakki{'\n'}
                • Veri tasima hakki{'\n'}
                • Islemlere itiraz hakki
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                8. Iletisim
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Gizlilik politikasi hakkinda sorulariniz icin ozadaliomerfaruk@gmail.com adresinden bize ulasabilirsiniz.
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
