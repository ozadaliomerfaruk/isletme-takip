import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Tag,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { Text, Card, TabFilter, EmptyState, Button } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { useKategoriler, useDeleteKategori } from '@/hooks/useKategoriler';
import { KategoriType } from '@/types/database';

const typeOptions = [
  { label: 'Gelir', value: 'gelir' },
  { label: 'Gider', value: 'gider' },
];

export default function KategorilerPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<KategoriType>('gelir');

  const { data: kategoriler, isLoading } = useKategoriler(selectedType);
  const deleteKategori = useDeleteKategori();

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      'Kategoriyi Sil',
      `"${name}" kategorisini silmek istediginizden emin misiniz?`,
      [
        { text: 'Iptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteKategori.mutateAsync(id);
            } catch (error: any) {
              Alert.alert('Hata', error.message || 'Kategori silinemedi');
            }
          },
        },
      ]
    );
  };

  const getTypeIcon = (type: KategoriType) => {
    return type === 'gelir' ? (
      <TrendingUp size={20} color={colors.success} />
    ) : (
      <TrendingDown size={20} color={colors.error} />
    );
  };

  const getTypeColor = (type: KategoriType) => {
    return type === 'gelir' ? colors.successLight : colors.errorLight;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Tip Filtresi */}
          <View style={styles.filterContainer}>
            <TabFilter
              options={typeOptions}
              value={selectedType}
              onChange={(value) => setSelectedType(value as KategoriType)}
            />
          </View>

          {/* Kategori Ekle Butonu */}
          <View style={styles.addButtonContainer}>
            <Button
              variant="primary"
              size="md"
              icon={<Plus size={18} color={colors.surface} />}
              onPress={() => router.push('/kategoriler/ekle')}
            >
              Kategori Ekle
            </Button>
          </View>

          {/* Kategori Listesi */}
          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Text color="secondary">Yukleniyor...</Text>
              </View>
            ) : !kategoriler || kategoriler.length === 0 ? (
              <EmptyState
                icon={<Tag size={48} color={colors.textMuted} />}
                title={`${selectedType === 'gelir' ? 'Gelir' : 'Gider'} kategorisi yok`}
                description="Yeni kategori ekleyerek baslayin"
                actionLabel="Kategori Ekle"
                onAction={() => router.push('/kategoriler/ekle')}
              />
            ) : (
              <Card padding="none">
                {kategoriler.map((kategori, index) => (
                  <View key={kategori.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.kategoriItem}>
                      <View
                        style={[
                          styles.kategoriIcon,
                          { backgroundColor: getTypeColor(kategori.type) },
                        ]}
                      >
                        {getTypeIcon(kategori.type)}
                      </View>
                      <View style={styles.kategoriInfo}>
                        <Text variant="body">{kategori.name}</Text>
                        <Text variant="caption" color="secondary">
                          {kategori.type === 'gelir' ? 'Gelir Kategorisi' : 'Gider Kategorisi'}
                        </Text>
                      </View>
                      <View style={styles.kategoriActions}>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() =>
                            router.push({
                              pathname: '/kategoriler/duzenle/[id]',
                              params: { id: kategori.id },
                            })
                          }
                        >
                          <Pencil size={18} color={colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleDelete(kategori.id, kategori.name)}
                        >
                          <Trash2 size={18} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>

          {/* Bilgi */}
          <View style={styles.infoContainer}>
            <Text variant="caption" color="muted" style={styles.infoText}>
              Kategoriler, gelir ve gider islemlerinizi gruplamak icin kullanilir.
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
  filterContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  addButtonContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  kategoriItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  kategoriIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kategoriInfo: {
    flex: 1,
  },
  kategoriActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  infoContainer: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  infoText: {
    textAlign: 'center',
  },
});
