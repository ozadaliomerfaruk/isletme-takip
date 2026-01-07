import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Receipt,
  BarChart3,
  Building2,
  Tag,
  FileText,
  Shield,
  ScrollText,
  LogOut,
  ChevronRight,
  Trash2,
} from 'lucide-react-native';
import { Text, Card } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing, borderRadius } from '@/constants/spacing';
import { useAuthContext } from '@/contexts/AuthContext';

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onPress, danger }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>{icon}</View>
      <Text variant="body" style={danger && { color: colors.error }}>
        {label}
      </Text>
      <ChevronRight size={20} color={danger ? colors.error : colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function DahaPage() {
  const router = useRouter();
  const { signOut } = useAuthContext();

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Çıkmak istediğinizden emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Hata', 'Çıkış yapılırken bir sorun oluştu. Lütfen tekrar deneyin.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text variant="h2">Daha</Text>
        </View>

        {/* Islemler & Raporlar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            ISLEMLER & RAPORLAR
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Receipt size={22} color={colors.primary} />}
              label="Tüm İşlemler"
              onPress={() => router.push('/islemler')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<BarChart3 size={22} color={colors.info} />}
              label="Raporlar"
              onPress={() => router.push('/raporlar')}
            />
          </Card>
        </View>

        {/* Ayarlar */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            AYARLAR
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<Building2 size={22} color={colors.warning} />}
              label="İşletme Bilgileri"
              onPress={() => router.push('/ayarlar/isletme')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Tag size={22} color={colors.success} />}
              label="Kategoriler"
              onPress={() => router.push('/kategoriler')}
            />
          </Card>
        </View>

        {/* Yasal */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            YASAL
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<FileText size={22} color={colors.textSecondary} />}
              label="Kullanım Koşulları"
              onPress={() => router.push('/yasal/kullanim-kosullari')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Shield size={22} color={colors.textSecondary} />}
              label="Gizlilik Politikası"
              onPress={() => router.push('/yasal/gizlilik-politikasi')}
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<ScrollText size={22} color={colors.textSecondary} />}
              label="KVKK Aydınlatma Metni"
              onPress={() => router.push('/yasal/kvkk')}
            />
          </Card>
        </View>

        {/* Hesap */}
        <View style={styles.section}>
          <Text variant="label" color="secondary" style={styles.sectionTitle}>
            HESAP
          </Text>
          <Card padding="none">
            <MenuItem
              icon={<LogOut size={22} color={colors.error} />}
              label="Çıkış Yap"
              onPress={handleLogout}
              danger
            />
            <View style={styles.divider} />
            <MenuItem
              icon={<Trash2 size={22} color={colors.error} />}
              label="Hesabı Sil"
              onPress={() => router.push('/ayarlar/hesap-sil' as any)}
              danger
            />
          </Card>
        </View>

        {/* Versiyon */}
        <View style={styles.versionContainer}>
          <Text variant="caption" color="muted">
            İşletme Takip v1.0.0
          </Text>
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconDanger: {
    backgroundColor: colors.errorLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
});
