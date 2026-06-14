/**
 * useSetupProgress — "Kurulumu bitir" kartı için kurulum ilerlemesi.
 *
 * 4 adım: sektör seçimi · banka hesabı · ilk cari · ilk işlem.
 * Otomatik açılan Kasa (is_auto_created) kurulum SAYILMAZ — kullanıcı gerçekten
 * banka/cari/işlem eklediyse ilerleme dolar.
 *
 * Kart yalnızca İŞLETME SAHİBİNE ve kurulum eksikse gösterilir; kullanıcı
 * "şimdilik gizle" derse AsyncStorage'da işaretlenir (bir daha gösterilmez).
 *
 * Veri kaynakları (useHesaplar/useCariler) ana ekranda zaten yüklü olduğundan
 * react-query dedupe eder — ekstra ağ isteği doğurmaz. "İlk işlem" için minimal
 * varlık sorgusu yapılır (en fazla 1 satır çeker) ve 'islemler' prefix'i işlem
 * eklenince invalidate edildiği için kart otomatik güncellenir.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useHesaplar } from './useHesaplar';
import { useCariler } from './useCariler';

export type SetupStepKey = 'sector' | 'banka' | 'cari' | 'islem';

export interface SetupStep {
  key: SetupStepKey;
  done: boolean;
}

const DISMISS_KEY = '@defter_finish_setup_dismissed';

export interface SetupProgress {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  /** Kart gösterilmeli mi? (sahip + eksik + gizlenmemiş + veriler yüklendi) */
  shouldShow: boolean;
  /** "Şimdilik gizle" — kalıcı olarak kapatır. */
  dismiss: () => void;
}

export function useSetupProgress(): SetupProgress {
  const { isletme, isletmeLoading, isOwner } = useAuthContext();
  const { data: hesaplar, isLoading: hesaplarLoading } = useHesaplar(true);
  const { data: musteri, isLoading: musteriLoading } = useCariler('musteri');
  const { data: tedarikci, isLoading: tedarikciLoading } = useCariler('tedarikci');

  // İlk işlem var mı? (en fazla 1 satır — sayım maliyeti yok)
  const { data: hasIslem, isLoading: islemLoading } = useQuery({
    queryKey: ['islemler', isletme?.id ?? '', { setupHasAny: true }],
    queryFn: async () => {
      if (!isletme) return false;
      const { data, error } = await supabase
        .from('islemler')
        .select('id')
        .eq('isletme_id', isletme.id)
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!isletme,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    meta: { query_purpose: 'setup:hasIslem' },
  });

  // "Şimdilik gizle" durumu (AsyncStorage)
  const [dismissed, setDismissed] = useState(false);
  const [dismissLoaded, setDismissLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((v) => {
        if (active) {
          setDismissed(v === 'true');
          setDismissLoaded(true);
        }
      })
      .catch(() => {
        if (active) setDismissLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISS_KEY, 'true').catch(() => {});
  }, []);

  const steps: SetupStep[] = [
    { key: 'sector', done: !!isletme?.sector },
    { key: 'banka', done: !!hesaplar?.some((h) => h.type === 'banka') },
    { key: 'cari', done: (musteri?.length ?? 0) + (tedarikci?.length ?? 0) > 0 },
    { key: 'islem', done: !!hasIslem },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const isComplete = completedCount === steps.length;

  const dataLoading =
    isletmeLoading || hesaplarLoading || musteriLoading || tedarikciLoading || islemLoading;

  const shouldShow =
    !!isletme && isOwner && dismissLoaded && !dataLoading && !dismissed && !isComplete;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    isComplete,
    shouldShow,
    dismiss,
  };
}
