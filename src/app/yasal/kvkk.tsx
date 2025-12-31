import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';

export default function KVKKPage() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Text variant="h3" style={styles.title}>
            KVKK Aydınlatma Metni
          </Text>
          <Text variant="caption" color="secondary" style={styles.date}>
            6698 Sayılı Kişisel Verilerin Korunması Kanunu
          </Text>

          <View style={styles.section}>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Bu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca veri sorumlusu sıfatıyla hazırlanmıştır.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              1. Veri Sorumlusu
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Ömer Faruk Özadalı{'\n'}
              Adres: İstanbul, Türkiye{'\n'}
              E-posta: ozadaliomerfaruk@gmail.com
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              2. İşlenen Kişisel Veriler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Uygulama kapsamında aşağıdaki kişisel veriler işlenebilmektedir:{'\n\n'}
              <Text style={styles.bold}>Kimlik ve Hesap Bilgileri:</Text>{'\n'}
              E-posta adresi{'\n\n'}
              <Text style={styles.bold}>İletişim Bilgileri</Text> (kullanıcı tarafından girilmesi halinde):{'\n'}
              Telefon numarası{'\n\n'}
              <Text style={styles.bold}>Kimlik Doğrulama ve Oturum Bilgileri:</Text>{'\n'}
              Oturum ve yetkilendirme bilgileri{'\n\n'}
              <Text style={styles.bold}>Finansal Bilgiler:</Text>{'\n'}
              Kullanıcı tarafından manuel olarak girilen işletme hesap kayıtları{'\n\n'}
              <Text style={styles.bold}>İşlem ve Teknik Güvenlik Bilgileri:</Text>{'\n'}
              Sistem güvenliği ve hizmetin sağlanması amacıyla oluşturulan teknik kayıtlar
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Kişisel Verilerin İşlenme Amaçları
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kişisel verileriniz aşağıdaki amaçlarla işlenmektedir:{'\n\n'}
              • Üyelik ve hesap işlemlerinin yürütülmesi{'\n'}
              • Uygulama hizmetlerinin sunulması{'\n'}
              • Finansal kayıt ve raporlama fonksiyonlarının sağlanması{'\n'}
              • Bilgi güvenliği süreçlerinin yürütülmesi{'\n'}
              • Yasal yükümlülüklerin yerine getirilmesi
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Hukuki Sebepler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kişisel verileriniz, KVKK'nın 5. maddesi uyarınca aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:{'\n\n'}
              • Bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması{'\n'}
              • Veri sorumlusunun hukuki yükümlülüklerini yerine getirebilmesi{'\n'}
              • Bir hakkın tesisi, kullanılması veya korunması{'\n'}
              • Veri sorumlusunun meşru menfaatleri{'\n\n'}
              Açık rıza, yalnızca gerekli hallerde alınmaktadır.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Kişisel Verilerin Aktarılması
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kişisel verileriniz;{'\n\n'}
              • Yasal zorunluluk hallerinde yetkili kamu kurum ve kuruluşlarına{'\n'}
              • Teknik altyapı ve bulut hizmet sağlayıcılarına{'\n\n'}
              KVKK'nın 8. ve 9. maddelerine uygun olarak aktarılabilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Veri Sahibi Hakları
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              KVKK'nın 11. maddesi uyarınca veri sahipleri olarak:{'\n\n'}
              a) Kişisel verilerinizin işlenip işlenmediğini öğrenme{'\n'}
              b) İşlenmişse buna ilişkin bilgi talep etme{'\n'}
              c) İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme{'\n'}
              d) Aktarıldığı üçüncü kişileri bilme{'\n'}
              e) Eksik veya yanlış işlenmişse düzeltilmesini isteme{'\n'}
              f) Silinmesini veya yok edilmesini isteme{'\n'}
              g) Bu işlemlerin üçüncü kişilere bildirilmesini isteme{'\n'}
              h) Aleyhinize bir sonucun ortaya çıkmasına itiraz etme{'\n'}
              i) Zarara uğramanız halinde giderilmesini talep etme{'\n\n'}
              haklarına sahipsiniz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Başvuru Yöntemi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Haklarınızı kullanmak için aşağıdaki yöntemle başvurabilirsiniz:{'\n\n'}
              E-posta: ozadaliomerfaruk@gmail.com{'\n'}
              Konu: KVKK Bilgi Talebi{'\n\n'}
              Başvurularınız, en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.
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
  bold: {
    fontWeight: '600',
  },
});
