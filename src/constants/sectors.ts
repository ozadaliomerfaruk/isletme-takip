/**
 * Sektör listesi — TEK KAYNAK.
 *
 * NEDEN: aynı dizi hem kurulum 1/3 ekranında hem Ayarlar > İşletme Bilgileri'nde
 * kullanılıyordu; kopyalar ayrışınca aynı sektör iki ekranda farklı ikon/renkle
 * görünüyordu. Sıra ve değerler kopyalarla birebir aynıdır (görsel değişiklik yok).
 *
 * Renkler bilinçli olarak ham hex: 12 aksanın yalnız 4'ünün colors.ts'te karşılığı
 * var, karışık kullanım listeyi okunmaz hale getirirdi. Bunlar marka paletinin
 * parçası değil, yalnızca sektör ayırt edici aksanlarıdır.
 */
import {
  ShoppingBasket,
  Coffee,
  Scissors,
  Shirt,
  Car,
  Hammer,
  Truck,
  Pill,
  Building2,
  Camera,
  Laptop,
  Store,
  type LucideIcon,
} from 'lucide-react-native';

import type { IsletmeSector } from '@/types/database';

export const SECTORS: { id: IsletmeSector; icon: LucideIcon; color: string }[] = [
  { id: 'market_bakkal', icon: ShoppingBasket, color: '#10B981' },
  { id: 'kafe_restoran', icon: Coffee, color: '#F59E0B' },
  { id: 'berber_kuafor', icon: Scissors, color: '#8B5CF6' },
  { id: 'giyim_tekstil', icon: Shirt, color: '#EC4899' },
  { id: 'oto', icon: Car, color: '#3B82F6' },
  { id: 'nalbur_insaat', icon: Hammer, color: '#EF4444' },
  { id: 'toptan_dagitim', icon: Truck, color: '#14B8A6' },
  { id: 'eczane', icon: Pill, color: '#06B6D4' },
  { id: 'emlak', icon: Building2, color: '#0EA5E9' },
  { id: 'fotografci', icon: Camera, color: '#D946EF' },
  { id: 'serbest_meslek', icon: Laptop, color: '#6366F1' },
  { id: 'diger', icon: Store, color: '#6B7280' },
];
