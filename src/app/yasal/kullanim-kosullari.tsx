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
            Kullanım Koşulları
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            Son Güncelleme: 22 Aralık 2025
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip uygulamasını kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              1. Hizmet Tanımı
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip, küçük ve orta ölçekli işletmeler için geliştirilmiş bir finansal takip ve yönetim uygulamasıdır. Uygulama; gelir-gider takibi, cari hesap yönetimi, personel kayıt ve ödeme takibi ile finansal raporlama araçları sunar.{'\n\n'}Uygulama, resmi muhasebe, bordro, vergi veya hukuki danışmanlık hizmeti sunmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              2. Kullanım Şartları ve Yaş Sınırı
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Bu uygulamayı kullanabilmek için en az 13 yaşında olmanız gerekmektedir. 13 yaşından küçük bireylerin uygulamayı kullanması yasaktır.{'\n\n'}Kullanıcı, uygulamaya girdiği tüm verilerin doğruluğu, güncelliği ve mevzuata uygunluğundan sorumludur. Yanlış veya eksik veri girişinden kaynaklanan sonuçlardan İşletme Takip sorumlu tutulamaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Hesap Güvenliği
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanıcı, hesap bilgilerini gizli tutmak ve yetkisiz erişimi önlemekle yükümlüdür. Hesap üzerinden gerçekleştirilen tüm işlemlerden kullanıcı sorumludur.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Veri Güvenliği
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanıcı verileri, güvenli sunucular üzerinde ve makul teknik güvenlik önlemleri uygulanarak saklanır. Bununla birlikte, internet üzerinden gerçekleştirilen veri iletimlerinin tamamen risksiz olmadığı kabul edilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Hesap Silme
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanıcı, hesabını uygulama içerisindeki Ayarlar {'>'} Hesabımı Sil menüsü üzerinden silebilir. Hesap silme talebi sonrasında 7 günlük bekleme süresi uygulanır. Bu süre içerisinde kullanıcı silme işlemini iptal edebilir. Bekleme süresinin sonunda hesap ve hesaba bağlı tüm veriler kalıcı olarak silinir ve geri alınamaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Üçüncü Taraf Hizmetler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama, kimlik doğrulama amacıyla Apple Kimliği ve Google Hesabı gibi üçüncü taraf hizmetleri kullanabilir. Bu hizmetlerin kullanımı, ilgili hizmet sağlayıcıların kendi kullanım koşullarına tabidir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Hizmet Değişiklikleri
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip, uygulamanın hizmet içeriğini, özelliklerini ve fiyatlandırmasını önceden bildirimde bulunmaksızın değiştirme hakkını saklı tutar.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              8. Fikri Mülkiyet
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip uygulamasının tasarımı, yazılımı ve marka unsurları İşletme Takip'e aittir. Kullanıcı tarafından uygulamaya girilen tüm verilerin mülkiyeti kullanıcıya aittir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              9. Sorumluluğun Sınırlandırılması
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip, uygulamanın kullanımından doğabilecek dolaylı zararlardan sorumlu tutulamaz. Uygulama, mevcut haliyle ("olduğu gibi") sunulmaktadır.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              10. Uyuşmazlıkların Çözümü
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Bu kullanım koşullarından doğabilecek uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır ve İstanbul Mahkemeleri yetkilidir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              11. İletişim
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanım koşulları ile ilgili sorularınız için:{'\n'}ozadaliomerfaruk@gmail.com
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
