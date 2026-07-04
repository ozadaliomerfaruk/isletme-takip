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
import { logEvent } from '@/lib/appEvents';
import { IslemWithRelations, Currency } from '@/types/database';
import { formatDateForDB } from '@/lib/date';
import { fetchAllPages } from '@/lib/supabaseHelpers';
import { LEAVE_TYPES, CARI_ISLEM_TYPES, PERSONEL_ISLEM_TYPES } from '@/constants/islemTypes';
import { toErrorMessage } from '@/lib/errors';

// Büyük veri uyarısı için eşik değer
const LARGE_DATA_THRESHOLD = 2000;

interface UseExcelExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
  currentIsletmeId?: string;
  typeMismatch?: boolean;
}

interface UseExcelExportReturn {
  isExporting: boolean;
  exportExcel: (startDate: string, endDate: string) => Promise<void>;
}

export function useExcelExport(options: UseExcelExportOptions): UseExcelExportReturn {
  const { entityType, entityId, entityName, entityCurrency, currentBalance, cariType, currentIsletmeId, typeMismatch } = options;
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
        cariPersonelColumn: t('common:export.excel.cariPersonelColumn'),
        debit: t('common:export.excel.debit'),
        credit: t('common:export.excel.credit'),
        debitBalance: t('common:export.excel.debitBalance'),
        creditBalance: t('common:export.excel.creditBalance'),
        openingBalance: t('common:export.excel.openingBalance'),
        periodTotal: t('common:export.excel.periodTotal'),
        closingBalance: t('common:export.excel.closingBalance'),
        sheetName: t('common:export.excel.sheetName'),
        // Transaction type labels
        transactionTypes: {
          gelir: t('transactions:types.gelir'),
          gider: t('transactions:types.gider'),
          transfer: t('transactions:types.transfer'),
          cari_alis: t('transactions:types.cari_alis'),
          cari_satis: t('transactions:types.cari_satis'),
          cari_odeme: t('transactions:types.cari_odeme'),
          cari_tahsilat: t('transactions:types.cari_tahsilat'),
          cari_alis_iade: t('transactions:types.cari_alis_iade'),
          cari_satis_iade: t('transactions:types.cari_satis_iade'),
          personel_gider: t('transactions:types.personel_gider'),
          personel_odeme: t('transactions:types.personel_odeme'),
          personel_tahsilat: t('transactions:types.personel_tahsilat'),
          personel_satis: t('transactions:types.personel_satis'),
          kredi_karti_harcama: t('transactions:types.kredi_karti_harcama'),
        },
        statementFileName: t('common:export.excel.statementFileName'),
        shareDialogTitle: t('common:export.shareDialogTitle'),
        sharingNotSupported: t('common:export.sharingNotSupported'),
        noDataError: t('common:export.noDataToExport'),
      };

      // Ekstreye girecek satırlar: izinler hariç; cari/personel ekstresi
      // yalnız ilgili tip ailesini içerir (import yabancı tiplere entity
      // bağlayabiliyordu → boş satır + donmuş bakiye); hesap ekstresinde
      // transfer dışı işlemler yalnız kaynak-hesap tarafında sayılır
      // (import her tipte hedef_hesap_id yazabildiğinden hayalet satır önleme)
      const keepInStatement = (islem: IslemWithRelations) => {
        if (LEAVE_TYPES.includes(islem.type)) return false;
        if (entityType === 'cari') return CARI_ISLEM_TYPES.includes(islem.type);
        if (entityType === 'personel') return PERSONEL_ISLEM_TYPES.includes(islem.type);
        if (entityType === 'hesap') {
          return islem.hesap_id === entityId
            || (islem.type === 'transfer' && islem.hedef_hesap_id === entityId);
        }
        return true;
      };

      // Export işlemini gerçekleştiren fonksiyon
      const performExport = async () => {
        setIsExporting(true);

        try {
          // Bitiş tarihi için günün sonunu hesapla (yerel timezone ile)
          const endDateTime = new Date(endDate + 'T00:00:00');
          endDateTime.setDate(endDateTime.getDate() + 1);
          const endDateNextDay = formatDateForDB(endDateTime);

          // Seçilen dönemdeki işlemleri getir (paginated - 1000 satır limitini aşmak için)
          const buildTransactionsQuery = () => {
            let q = supabase
              .from('islemler')
              .select(`
                *,
                hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
                hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
                kategori:kategoriler(id,name),
                cari:cariler(id,name,type),
                personel:personel(id,first_name,last_name)
              `)
              .gte('date', startDate)
              .lt('date', endDateNextDay)
              // İkincil unique sıralama şart: fetchAllPages offset'li sayfalar
              // çeker, eşit tarihli satırlar sayfa sınırında kaybolabilir
              .order('date', { ascending: true })
              .order('id', { ascending: true });

            // Cari için isletme_id filtresi koymuyoruz çünkü paylaşılan carilerde
            // A ve B farklı isletme_id'lere sahip — RLS yeterli
            if (entityType !== 'cari') {
              q = q.eq('isletme_id', isletme.id);
            }

            if (entityType === 'hesap') {
              q = q.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
            } else if (entityType === 'cari') {
              q = q.eq('cari_id', entityId);
            } else if (entityType === 'personel') {
              q = q.eq('personel_id', entityId);
            }
            return q;
          };

          const rawTransactions = await fetchAllPages<IslemWithRelations>(buildTransactionsQuery);
          const transactions = rawTransactions.filter(keepInStatement);

          // Tüm işlemleri getir (başlangıç bakiyesi hesabı için) - paginated
          const buildAllQuery = () => {
            let q = supabase
              .from('islemler')
              .select(`
                *,
                hesap:hesaplar!islemler_hesap_id_fkey(id,name,currency,type,is_active),
                hedef_hesap:hesaplar!islemler_hedef_hesap_id_fkey(id,name,currency,type,is_active),
                kategori:kategoriler(id,name),
                cari:cariler(id,name,type),
                personel:personel(id,first_name,last_name)
              `)
              // İkincil unique sıralama şart: fetchAllPages offset'li sayfalar
              // çeker, eşit tarihli satırlar sayfa sınırında kaybolabilir
              .order('date', { ascending: true })
              .order('id', { ascending: true });

            if (entityType !== 'cari') {
              q = q.eq('isletme_id', isletme.id);
            }

            if (entityType === 'hesap') {
              q = q.or(`hesap_id.eq.${entityId},hedef_hesap_id.eq.${entityId}`);
            } else if (entityType === 'cari') {
              q = q.eq('cari_id', entityId);
            } else if (entityType === 'personel') {
              q = q.eq('personel_id', entityId);
            }
            return q;
          };

          const rawAllTransactions = await fetchAllPages<IslemWithRelations>(buildAllQuery);
          const allTransactions = rawAllTransactions.filter(keepInStatement);

          // Export et
          await exportToExcel({
            entityType,
            entityId,
            entityName,
            entityCurrency,
            isletmeName: isletme.name,
            startDate,
            endDate,
            transactions,
            allTransactions,
            currentBalance,
            cariType,
            currentIsletmeId,
            typeMismatch,
            translations,
          });
          logEvent('export_completed', { format: 'excel', entity_type: entityType });
        } catch (error) {
          console.error('Excel export hatası:', error);
          Alert.alert(
            t('common:status.error'),
            toErrorMessage(error) || t('common:status.error')
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
          .gte('date', startDate)
          .lt('date', endDateNextDay);

        if (entityType !== 'cari') {
          countQuery = countQuery.eq('isletme_id', isletme.id);
        }

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
      } catch (error) {
        console.error('Satır sayısı kontrol hatası:', error);
        // Hata olursa yine de export'a izin ver
        await performExport();
      }
    },
    [entityType, entityId, entityName, entityCurrency, currentBalance, cariType, currentIsletmeId, typeMismatch, isletme, t]
  );

  return {
    isExporting,
    exportExcel,
  };
}
