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
              KVKK Aydinlatma Metni
            </Text>
            <Text variant="caption" color="secondary" style={styles.date}>
              6698 Sayili Kisisel Verilerin Korunmasi Kanunu
            </Text>

            <View style={styles.section}>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Bu aydinlatma metni, 6698 sayili Kisisel Verilerin Korunmasi Kanunu ("KVKK") uyarinca veri sorumlusu sifatiyla hazirlanmistir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                1. Veri Sorumlusu
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Omer Faruk Ozadali{'\n'}
                Adres: Istanbul, Turkiye{'\n'}
                E-posta: ozadaliomerfaruk@gmail.com
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                2. Islenen Kisisel Veriler
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Asagidaki kisisel verileriniz islenmektedir:{'\n\n'}
                <Text style={styles.bold}>Kimlik Bilgileri:</Text> Ad, soyad{'\n'}
                <Text style={styles.bold}>Iletisim Bilgileri:</Text> E-posta, telefon{'\n'}
                <Text style={styles.bold}>Islem Guvenligi:</Text> Sifre, oturum bilgileri{'\n'}
                <Text style={styles.bold}>Finansal Bilgiler:</Text> Isletme hesap hareketleri{'\n'}
                <Text style={styles.bold}>Islem Bilgileri:</Text> Uygulama kullanim kayitlari
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                3. Veri Isleme Amaclari
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kisisel verileriniz asagidaki amaclarla islenmektedir:{'\n\n'}
                • Uyelik islemlerinin yurutulmesi{'\n'}
                • Uygulama hizmetlerinin sunulmasi{'\n'}
                • Finansal raporlama hizmetleri{'\n'}
                • Musteri iliskileri yonetimi{'\n'}
                • Yasal yukumluluklerin yerine getirilmesi{'\n'}
                • Bilgi guvenligi sureclerinin yurutulmesi
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                4. Hukuki Sebepler
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kisisel verileriniz KVKK'nin 5. ve 6. maddelerinde belirtilen:{'\n\n'}
                • Acik rizanizin bulunmasi{'\n'}
                • Sozlesmenin kurulmasi ve ifasi{'\n'}
                • Hukuki yukumlulugun yerine getirilmesi{'\n'}
                • Mesru menfaatlerimiz
                {'\n\n'}
                hukuki sebeplerine dayanilarak islenmektedir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                5. Veri Aktarimi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Kisisel verileriniz;{'\n\n'}
                • Yasal zorunluluk halinde yetkili kamu kurumlarina{'\n'}
                • Hizmet aldigi̇mi̇z is ortaklarina{'\n'}
                • Bulut hizmet saglayicilarına
                {'\n\n'}
                KVKK'nin 8. ve 9. maddeleri kapsaminda aktarilabilmektedir.
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                6. Veri Sahibi Haklari
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                KVKK'nin 11. maddesi uyarinca asagidaki haklara sahipsiniz:{'\n\n'}
                a) Kisisel verilerinizin islenip islenmedigini ogrenme{'\n'}
                b) Islenmisse buna iliskin bilgi talep etme{'\n'}
                c) Isleme amacini ve amacina uygun kullanilip kullanilmadigini ogrenme{'\n'}
                d) Yurt ici/yurt disinda aktarildigi ucuncu kisileri bilme{'\n'}
                e) Eksik veya yanlis islenmisse duzeltilmesini isteme{'\n'}
                f) KVKK'nin 7. maddesindeki sartlar cercevesinde silinmesini isteme{'\n'}
                g) Duzeltme ve silme islemlerinin aktarim yapilan ucuncu kisilere bildirilmesini isteme{'\n'}
                h) Islenen verilerin munhasiran otomatik sistemler vasitasiyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya cikmasina itiraz etme{'\n'}
                i) Kanuna aykiri isleme sebebiyle zarara ugramaniz halinde zararin giderilmesini talep etme
              </Text>
            </View>

            <View style={styles.section}>
              <Text variant="label" style={styles.sectionTitle}>
                7. Basvuru Yontemi
              </Text>
              <Text variant="body" color="secondary" style={styles.paragraph}>
                Haklarinizi kullanmak icin asagidaki yontemlerle basvurabilirsiniz:{'\n\n'}
                <Text style={styles.bold}>E-posta:</Text> ozadaliomerfaruk@gmail.com{'\n'}
                <Text style={styles.bold}>Konu:</Text> KVKK Bilgi Talebi
                {'\n\n'}
                Basvurunuz en gec 30 gun icinde ucretsiz olarak sonuclandirilacaktir. Islemin ayrica bir maliyet gerektirmesi halinde Kisisel Verileri Koruma Kurulu tarafindan belirlenen ucret alinabilir.
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
