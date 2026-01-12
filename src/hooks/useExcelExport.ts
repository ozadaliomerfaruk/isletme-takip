/**
 * Excel Export Hook
 * Hesap, Cari ve Personel ekstrelerini export etmek için hook
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { exportToExcel, EntityType, ExcelTranslations } from '@/lib/excelExport';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { IslemWithRelations, Currency } from '@/types/database';
import { formatDateForDB } from '@/lib/date';

// Büyük veri uyarısı için eşik değer
const LARGE_DATA_THRESHOLD = 2000;

interface UseExcelExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
}

interface UseExcelExportReturn {
  isExporting: boolean;
  exportExcel: (startDate: string, endDate: string) => Promise<void>;
}

export function useExcelExport(options: UseExcelExportOptions): UseExcelExportReturn {
  const { entityType, entityId, entityName, entityCurrency, currentBalance, cariType } = options;
  const { isletme } = useAuthContext();
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const exportExcel = useCallback(
    async (startDate: string, endDate: string) => {
      if (!isletme) {
        Alert.alert(t('common:status.error'), t('common:empty.noData'));
        return;
      }

      // Excel çevirilerini al
      const translations: ExcelTranslations = {
        statement: t('common:export.excel.statement'),
        accountStatement: t('common:export.excel.accountStatement'),
        clientStatement: t('common:export.excel.clientStatement'),
        staffStatement: t('common:export.excel.staffStatement'),
        account: t('common:export.excel.account'),
        client: t('common:export.excel.client'),
        staff: t('common:export.excel.staff'),
        period: t('common:export.excel.period'),
        createdAt: t('common:export.excel.createdAt'),
        business: t('common:export.excel.business'),
        date: t('common:export.excel.date'),
        transactionType: t('common:export.excel.transactionType'),
        description: t('common:export.excel.description'),
        category: t('common:export.excel.category'),
        accountColumn: t('common:export.excel.accountColumn'),
        debit: t('common:export.excel.debit'),
        credit: t('common:export.excel.credit'),
        debitBalance: t('common:export.excel.debitBalance'),
        creditBalance: t('common:export.excel.creditBalance'),
        openingBalance: t('common:export.excel.openingBalance'),
        periodTotal: t('common:export.excel.periodTotal'),
        closingBalance: t('common:export.excel.closingBalance'),
        sheetName: t('common:export.excel.sheetName'),
      };

      // Export işlemini gerçekleştiren fonksiyon
      const performExport = async () => {
        setIsExporting(true);

        try {
          // Bitiş tarihi için günün sonunu hesapla (yerel timezone ile)
          const endDateTime = new Date(endDate + 'T00:00:00');
          endDateTime.setDate(endDateTime.getDate() + 1);
          const endDateNextDay = formatDateForDB(endDateTime);

          // Seçilen dönemdeki işlemleri getir
          let query = supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!islemler_hesap_id_fkey(*),
              hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(*),
              kategori:kategoriler(*),
              cari:cariler(*),
              personel:personel(*)
            `)
            .eq('isletme_id', isletme.id)
            .gte('date', startDate)
            .lt('date', endDateNextDay)
            .order('date', { ascending: true });

          // Entity tipine göre filtrele
          if (entityType === 'hesap') {
            query = query.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
          } else if (entityType === 'cari') {
            query = query.eq('cari_id', entityId);
          } else if (entityType === 'personel') {
            query = query.eq('personel_id', entityId);
          }

          const { data: transactions, error: transactionsError } = await query;

          if (transactionsError) throw transactionsError;

          // Tüm işlemleri getir (başlangıç bakiyesi hesabı için)
          let allQuery = supabase
            .from('islemler')
            .select(`
              *,
              hesap:hesaplar!islemler_hesap_id_fkey(*),
              hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(*),
              kategori:kategoriler(*),
              cari:cariler(*),
              personel:personel(*)
            `)
            .eq('isletme_id', isletme.id)
            .order('date', { ascending: true });

          if (entityType === 'hesap') {
            allQuery = allQuery.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
          } else if (entityType === 'cari') {
            allQuery = allQuery.eq('cari_id', entityId);
          } else if (entityType === 'personel') {
            allQuery = allQuery.eq('personel_id', entityId);
          }

          const { data: allTransactions, error: allError } = await allQuery;

          if (allError) throw allError;

          // Export et
          await exportToExcel({
            entityType,
            entityId,
            entityName,
            entityCurrency,
            isletmeName: isletme.name,
            startDate,
            endDate,
            transactions: (transactions || []) as IslemWithRelations[],
            allTransactions: (allTransactions || []) as IslemWithRelations[],
            currentBalance,
            cariType,
            translations,
          });
        } catch (error: any) {
          console.error('Excel export hatası:', error);
          Alert.alert(
            t('common:status.error'),
            error.message || t('common:status.error')
          );
        } finally {
          setIsExporting(false);
        }
      };

      // Önce satır sayısını kontrol et (sadece seçilen dönem için)
      try {
        const endDateTime = new Date(endDate + 'T00:00:00');
        endDateTime.setDate(endDateTime.getDate() + 1);
        const endDateNextDay = formatDateForDB(endDateTime);

        let countQuery = supabase
          .from('islemler')
          .select('id', { count: 'exact', head: true })
          .eq('isletme_id', isletme.id)
          .gte('date', startDate)
          .lt('date', endDateNextDay);

        if (entityType === 'hesap') {
          countQuery = countQuery.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
        } else if (entityType === 'cari') {
          countQuery = countQuery.eq('cari_id', entityId);
        } else if (entityType === 'personel') {
          countQuery = countQuery.eq('personel_id', entityId);
        }

        const { count, error: countError } = await countQuery;

        if (countError) throw countError;

        const rowCount = count || 0;

        // Eğer satır sayısı eşiği aşıyorsa uyarı göster
        if (rowCount > LARGE_DATA_THRESHOLD) {
          Alert.alert(
            t('common:export.largeDataWarning.title'),
            t('common:export.largeDataWarning.message', { count: rowCount }),
            [
              {
                text: t('common:buttons.cancel'),
                style: 'cancel',
              },
              {
                text: t('common:buttons.continue'),
                onPress: performExport,
              },
            ]
          );
        } else {
          // Eşik altındaysa direkt export et
          await performExport();
        }
      } catch (error: any) {
        console.error('Satır sayısı kontrol hatası:', error);
        // Hata olursa yine de export'a izin ver
        await performExport();
      }
    },
    [entityType, entityId, entityName, entityCurrency, currentBalance, cariType, isletme, t]
  );

  return {
    isExporting,
    exportExcel,
  };
}
