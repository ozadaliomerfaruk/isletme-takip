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
              Bu Aydinlatma Metni, 6698 sayili Kisisel Verilerin Korunmasi Kanunu ("KVKK") uyarinca veri sorumlusu sifatiyla hazirlanmistir.
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
              Uygulama kapsaminda asagidaki kisisel veriler islenebilmektedir:{'\n\n'}
              <Text style={styles.bold}>Kimlik ve Hesap Bilgileri:</Text>{'\n'}
              E-posta adresi{'\n\n'}
              <Text style={styles.bold}>Iletisim Bilgileri</Text> (kullanici tarafindan girilmesi halinde):{'\n'}
              Telefon numarasi{'\n\n'}
              <Text style={styles.bold}>Kimlik Dogrulama ve Oturum Bilgileri:</Text>{'\n'}
              Oturum ve yetkilendirme bilgileri{'\n\n'}
              <Text style={styles.bold}>Finansal Bilgiler:</Text>{'\n'}
              Kullanici tarafindan manuel olarak girilen isletme hesap kayitlari{'\n\n'}
              <Text style={styles.bold}>Islem ve Teknik Guvenlik Bilgileri:</Text>{'\n'}
              Sistem guvenligi ve hizmetin saglanmasi amaciyla olusturulan teknik kayitlar
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              3. Kisisel Verilerin Islenme Amaclari
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kisisel verileriniz asagidaki amaclarla islenmektedir:{'\n\n'}
              • Uyelik ve hesap islemlerinin yurutulmesi{'\n'}
              • Uygulama hizmetlerinin sunulmasi{'\n'}
              • Finansal kayit ve raporlama fonksiyonlarinin saglanmasi{'\n'}
              • Bilgi guvenligi sureclerinin yurutulmesi{'\n'}
              • Yasal yukumluluklerin yerine getirilmesi
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              4. Hukuki Sebepler
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kisisel verileriniz, KVKK'nin 5. maddesi uyarinca asagidaki hukuki sebeplere dayanilarak islenmektedir:{'\n\n'}
              • Bir sozlesmenin kurulmasi veya ifasiyla dogrudan ilgili olmasi{'\n'}
              • Veri sorumlusunun hukuki yukumluluklerini yerine getirebilmesi{'\n'}
              • Bir hakkin tesisi, kullanilmasi veya korunmasi{'\n'}
              • Veri sorumlusunun mesru menfaatleri{'\n\n'}
              Acik riza, yalnizca gerekli hallerde alinmaktadir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              5. Kisisel Verilerin Aktarilmasi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Kisisel verileriniz;{'\n\n'}
              • Yasal zorunluluk hallerinde yetkili kamu kurum ve kuruluslarina{'\n'}
              • Teknik altyapi ve bulut hizmet saglayicilarina{'\n\n'}
              KVKK'nin 8. ve 9. maddelerine uygun olarak aktarilabilir.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              6. Veri Sahibi Haklari
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              KVKK'nin 11. maddesi uyarinca veri sahipleri olarak:{'\n\n'}
              a) Kisisel verilerinizin islenip islenmedigini ogrenme{'\n'}
              b) Islenmisse buna iliskin bilgi talep etme{'\n'}
              c) Isleme amacini ve amacina uygun kullanilip kullanilmadigini ogrenme{'\n'}
              d) Aktarildigi ucuncu kisileri bilme{'\n'}
              e) Eksik veya yanlis islenmisse duzeltilmesini isteme{'\n'}
              f) Silinmesini veya yok edilmesini isteme{'\n'}
              g) Bu islemlerin ucuncu kisilere bildirilmesini isteme{'\n'}
              h) Aleyhinize bir sonucun ortaya cikmasina itiraz etme{'\n'}
              i) Zarara ugramaniz halinde giderilmesini talep etme{'\n\n'}
              haklarina sahipsiniz.
            </Text>
          </View>

          <View style={styles.section}>
            <Text variant="label" style={styles.sectionTitle}>
              7. Basvuru Yontemi
            </Text>
            <Text variant="body" color="secondary" style={styles.paragraph}>
              Haklarinizi kullanmak icin asagidaki yontemle basvurabilirsiniz:{'\n\n'}
              E-posta: ozadaliomerfaruk@gmail.com{'\n'}
              Konu: KVKK Bilgi Talebi{'\n\n'}
              Basvurulariniz, en gec 30 gun icinde ucretsiz olarak sonuclandirilir.
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
