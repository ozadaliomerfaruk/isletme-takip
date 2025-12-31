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
            Gizlilik Politikası
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            Son Güncelleme: 22 Aralık 2025
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              İşletme Takip olarak gizliliğinize önem veriyoruz. Bu Gizlilik Politikası, mobil uygulamamız aracılığıyla toplanan kişisel verilerin hangi amaçlarla işlendiğini, nasıl korunduğunu ve kullanıcıların haklarını açıklamaktadır.
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
              • Kimlik doğrulama bilgileri (şifreler uygulama geliştiricisi tarafından görülmez veya saklanmaz, güvenli kimlik doğrulama altyapıları üzerinden işlenir)
            </Text>

            <Text variant="body" style={styles.subTitle}>
              1.2 Kullanıcı Tarafından Girilen İçerikler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Aşağıdaki bilgiler tamamen kullanıcının isteğiyle ve manuel olarak girilir:{'\n'}
              • Finansal kayıtlar (banka hesapları, kasa, gelir-gider kayıtları){'\n'}
              • Cari hesap bilgileri (müşteri ve tedarikçi bilgileri){'\n'}
              • Personel bilgileri{'\n'}
              • Açıklamalar, notlar ve benzeri içerikler
            </Text>

            <Text variant="body" style={styles.subTitle}>
              1.3 Opsiyonel Bilgiler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Vergi numarası ve benzeri alanlar zorunlu değildir ve kullanıcı tarafından isteğe bağlı olarak girilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              2. Verilerin Kullanım Amaçları
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Toplanan veriler aşağıdaki amaçlarla işlenir:{'\n\n'}
              • Uygulama fonksiyonlarının sağlanması{'\n'}
              • Hesap ve oturum yönetimi{'\n'}
              • Finansal kayıt ve raporların oluşturulması{'\n'}
              • Teknik sorunların giderilmesi{'\n'}
              • Yasal yükümlülüklerin yerine getirilmesi{'\n\n'}
              Veriler reklam, pazarlama veya kullanıcı takibi amacıyla kullanılmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Verilerin Kullanıcıyla İlişkisi (Apple App Store Açısından)
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              • Kimlik ve hesap bilgileri, kullanıcı hesabı ile ilişkilidir.{'\n'}
              • Kullanıcı tarafından girilen finansal kayıtlar, cari ve personel bilgileri kullanıcının kendisine değil, kullanıcının hesabı kapsamında oluşturulan içeriklere aittir.{'\n'}
              • Bu veriler yalnızca ilgili kullanıcı tarafından erişilebilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Veri Güvenliği
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kişisel verilerin güvenliği için aşağıdaki önlemler alınmaktadır:{'\n\n'}
              • SSL/TLS ile şifrelenmiş veri iletimi{'\n'}
              • Güvenli sunucu altyapıları{'\n'}
              • Yetkilendirme ve erişim kontrol mekanizmaları{'\n'}
              • Yetkisiz erişimi önlemeye yönelik teknik tedbirler
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Üçüncü Taraf Hizmet Sağlayıcılar
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama aşağıdaki hizmet sağlayıcılardan faydalanabilir:{'\n\n'}
              • Kimlik doğrulama servisleri (Apple Kimliği, Google Hesabı){'\n'}
              • Veritabanı ve kimlik doğrulama altyapısı (Supabase){'\n'}
              • Bulut barındırma (hosting) hizmetleri{'\n\n'}
              Bu hizmet sağlayıcılar, verilere yalnızca uygulamanın işlevlerini yerine getirebilmek amacıyla ve sınırlı ölçüde erişebilir.{'\n\n'}
              Tüm üçüncü taraf hizmet sağlayıcılar, kullanıcı verilerine bu Gizlilik Politikası'nda belirtilen koruma düzeyine eşit veya daha yüksek düzeyde koruma sağlamakla yükümlüdür.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Veri Saklama Süresi ve Hesap Silme
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              • Veriler, kullanıcı hesabı aktif olduğu sürece saklanır.{'\n'}
              • Kullanıcı, uygulama içinden hesabını silebilir.{'\n'}
              • Hesap silme talebinden sonra 7 gün bekleme süresi uygulanır.{'\n'}
              • Bekleme süresi sonunda hesap ve hesaba bağlı tüm veriler otomatik olarak kalıcı şekilde silinir.{'\n'}
              • Apple Kimliği ile giriş yapan kullanıcılar için, hesap silme işlemi sırasında Apple kimlik doğrulama token'ları da iptal edilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Çocukların Gizliliği
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama 13 yaş altındaki çocuklara yönelik değildir. Bilerek çocuklara ait kişisel veriler toplanmaz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              8. Kullanıcı Hakları
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kullanıcılar, yürürlükteki mevzuat kapsamında:{'\n\n'}
              • Verilerine erişim hakkı{'\n'}
              • Düzeltme talep etme hakkı{'\n'}
              • Silinmesini isteme hakkı{'\n'}
              • İşlemeye itiraz etme hakkı{'\n\n'}
              haklarına sahiptir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              9. İletişim
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Gizlilik politikası ile ilgili sorular için:{'\n'}
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
