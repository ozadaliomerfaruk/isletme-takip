/**
 * Kategori İkonları
 *
 * Kullanıcının kategori oluştururken seçebileceği ikonlar.
 * Lucide icon adları kullanılır.
 */

export interface CategoryIconOption {
  name: string; // Lucide icon adı (veritabanına kaydedilir)
  label: string; // Kullanıcıya gösterilecek Türkçe etiket
  group: 'genel' | 'finans' | 'ulasim' | 'yiyecek' | 'alisveris' | 'teknoloji' | 'fatura' | 'personel' | 'diger';
}

/**
 * Kategori için kullanılabilecek ikonlar (alfabetik sırada)
 */
export const CATEGORY_ICONS: CategoryIconOption[] = [
  { name: 'file-check', label: 'Aidat', group: 'fatura' },
  { name: 'car', label: 'Araba', group: 'ulasim' },
  { name: 'archive', label: 'Arşiv', group: 'genel' },
  { name: 'trending-up', label: 'Artış', group: 'finans' },
  { name: 'settings', label: 'Ayarlar', group: 'diger' },
  { name: 'hand-coins', label: 'Bahşiş', group: 'finans' },
  { name: 'landmark', label: 'Banka', group: 'finans' },
  { name: 'banknote', label: 'Banknot', group: 'finans' },
  { name: 'wine', label: 'Bar', group: 'yiyecek' },
  { name: 'barcode', label: 'Barkod', group: 'alisveris' },
  { name: 'flag', label: 'Bayrak', group: 'genel' },
  { name: 'monitor', label: 'Bilgisayar', group: 'teknoloji' },
  { name: 'building', label: 'Bina/İşyeri', group: 'diger' },
  { name: 'circle-alert', label: 'Borç', group: 'finans' },
  { name: 'paintbrush', label: 'Boya', group: 'diger' },
  { name: 'coins', label: 'Bozuk Para', group: 'finans' },
  { name: 'wallet', label: 'Cüzdan', group: 'finans' },
  { name: 'user-check', label: 'Çalışan', group: 'personel' },
  { name: 'briefcase', label: 'Çanta', group: 'genel' },
  { name: 'hammer', label: 'Çekiç', group: 'diger' },
  { name: 'clipboard', label: 'Danışmanlık', group: 'diger' },
  { name: 'circle-plus', label: 'Diğer Gelir', group: 'diger' },
  { name: 'circle-minus', label: 'Diğer Gider', group: 'diger' },
  { name: 'hard-drive', label: 'Disk', group: 'teknoloji' },
  { name: 'flame', label: 'Doğalgaz', group: 'fatura' },
  { name: 'ice-cream-cone', label: 'Dondurma', group: 'yiyecek' },
  { name: 'circle-dollar-sign', label: 'Döviz', group: 'finans' },
  { name: 'trending-down', label: 'Düşüş', group: 'finans' },
  { name: 'cog', label: 'Ekipman', group: 'teknoloji' },
  { name: 'zap', label: 'Elektrik', group: 'fatura' },
  { name: 'beef', label: 'Et/Tavuk', group: 'yiyecek' },
  { name: 'tag', label: 'Etiket', group: 'genel' },
  { name: 'file-text', label: 'Fatura', group: 'fatura' },
  { name: 'croissant', label: 'Fırın', group: 'yiyecek' },
  { name: 'receipt', label: 'Fiş', group: 'finans' },
  { name: 'ship', label: 'Gemi', group: 'ulasim' },
  { name: 'users-round', label: 'Grup', group: 'personel' },
  { name: 'file-signature', label: 'Hakediş', group: 'diger' },
  { name: 'target', label: 'Hedef', group: 'diger' },
  { name: 'gift', label: 'Hediye', group: 'genel' },
  { name: 'calculator', label: 'Hesap', group: 'finans' },
  { name: 'globe', label: 'İhracat', group: 'diger' },
  { name: 'wifi', label: 'İnternet', group: 'fatura' },
  { name: 'construction', label: 'İşyeri Bakım', group: 'diger' },
  { name: 'egg', label: 'Kahvaltı', group: 'yiyecek' },
  { name: 'coffee', label: 'Kahve', group: 'yiyecek' },
  { name: 'heart', label: 'Kalp', group: 'genel' },
  { name: 'camera', label: 'Kamera', group: 'teknoloji' },
  { name: 'truck', label: 'Kamyon/Kargo', group: 'ulasim' },
  { name: 'hand-helping', label: 'Kapora', group: 'diger' },
  { name: 'chart-pie', label: 'Kar Payı', group: 'finans' },
  { name: 'layers', label: 'Katmanlar', group: 'genel' },
  { name: 'home', label: 'Kira', group: 'fatura' },
  { name: 'user', label: 'Kişi', group: 'personel' },
  { name: 'folder', label: 'Klasör', group: 'genel' },
  { name: 'scale', label: 'Komisyon', group: 'diger' },
  { name: 'map-pin', label: 'Konum', group: 'ulasim' },
  { name: 'credit-card', label: 'Kredi Kartı', group: 'finans' },
  { name: 'headphones', label: 'Kulaklık', group: 'teknoloji' },
  { name: 'piggy-bank', label: 'Kumbara', group: 'finans' },
  { name: 'wheat', label: 'Kuru Gıda', group: 'yiyecek' },
  { name: 'box', label: 'Kutu', group: 'alisveris' },
  { name: 'laptop', label: 'Laptop', group: 'teknoloji' },
  { name: 'calendar', label: 'Maaş Günü', group: 'personel' },
  { name: 'store', label: 'Mağaza', group: 'alisveris' },
  { name: 'scissors', label: 'Makas', group: 'diger' },
  { name: 'shopping-basket', label: 'Market', group: 'yiyecek' },
  { name: 'ribbon', label: 'Masa Örtüsü', group: 'diger' },
  { name: 'clock', label: 'Mesai', group: 'personel' },
  { name: 'apple', label: 'Meyve', group: 'yiyecek' },
  { name: 'circle-help', label: 'Muhtelif', group: 'diger' },
  { name: 'chef-hat', label: 'Mutfak', group: 'yiyecek' },
  { name: 'contact', label: 'Müşteri', group: 'alisveris' },
  { name: 'navigation', label: 'Navigasyon', group: 'ulasim' },
  { name: 'building-2', label: 'Ofis', group: 'diger' },
  { name: 'bed', label: 'Otel', group: 'ulasim' },
  { name: 'bus', label: 'Otobüs', group: 'ulasim' },
  { name: 'package', label: 'Paket/Ambalaj', group: 'alisveris' },
  { name: 'dollar-sign', label: 'Para', group: 'finans' },
  { name: 'cake', label: 'Pastane', group: 'yiyecek' },
  { name: 'users', label: 'Personel', group: 'personel' },
  { name: 'pizza', label: 'Pizza', group: 'yiyecek' },
  { name: 'award', label: 'Prim', group: 'personel' },
  { name: 'chart-bar', label: 'Rapor', group: 'diger' },
  { name: 'compass', label: 'Rehber', group: 'ulasim' },
  { name: 'megaphone', label: 'Reklam', group: 'diger' },
  { name: 'utensils', label: 'Restoran', group: 'yiyecek' },
  { name: 'badge', label: 'Rozet/SSK', group: 'personel' },
  { name: 'salad', label: 'Salata/Manav', group: 'yiyecek' },
  { name: 'shopping-cart', label: 'Sepet', group: 'alisveris' },
  { name: 'luggage', label: 'Seyahat', group: 'ulasim' },
  { name: 'droplet', label: 'Su', group: 'fatura' },
  { name: 'presentation', label: 'Sunum', group: 'diger' },
  { name: 'milk', label: 'Süt Ürünleri', group: 'yiyecek' },
  { name: 'sparkles', label: 'Süsleme', group: 'diger' },
  { name: 'wrench', label: 'Tamir', group: 'diger' },
  { name: 'handshake', label: 'Tedarikçi', group: 'alisveris' },
  { name: 'phone', label: 'Telefon', group: 'fatura' },
  { name: 'smartphone', label: 'Telefon (Cihaz)', group: 'teknoloji' },
  { name: 'spray-can', label: 'Temizlik', group: 'diger' },
  { name: 'train-front', label: 'Tren', group: 'ulasim' },
  { name: 'tv', label: 'TV', group: 'teknoloji' },
  { name: 'plane', label: 'Uçak', group: 'ulasim' },
  { name: 'scroll-text', label: 'Vergi', group: 'fatura' },
  { name: 'chart-line', label: 'Yatırım', group: 'diger' },
  { name: 'printer', label: 'Yazıcı', group: 'teknoloji' },
  { name: 'bookmark', label: 'Yer İmi', group: 'genel' },
  { name: 'star', label: 'Yıldız', group: 'genel' },
  { name: 'percent', label: 'Yüzde/Ciro', group: 'finans' },
];

/**
 * Varsayılan kategori renkleri
 */
export const CATEGORY_COLORS = [
  { value: '#10B981', label: 'Yeşil' },
  { value: '#3B82F6', label: 'Mavi' },
  { value: '#F59E0B', label: 'Turuncu' },
  { value: '#EF4444', label: 'Kırmızı' },
  { value: '#8B5CF6', label: 'Mor' },
  { value: '#EC4899', label: 'Pembe' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#6366F1', label: 'İndigo' },
  { value: '#14B8A6', label: 'Teal' },
  { value: '#F97316', label: 'Turuncu Koyu' },
];

/**
 * Varsayılan ikon (ikon seçilmezse)
 */
export const DEFAULT_CATEGORY_ICON = 'tag';

/**
 * Varsayılan renk (renk seçilmezse)
 */
export const DEFAULT_CATEGORY_COLOR = '#6366F1';
