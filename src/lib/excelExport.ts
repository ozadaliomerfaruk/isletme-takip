/**
 * Excel Export Utility
 * Hesap, Cari ve Personel ekstrelerini Excel formatında export eder
 * Profesyonel formatlama ve stil desteği ile
 */

import XLSX from 'xlsx-js-style';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { formatDateShort, formatDateTime } from './date';
import { formatCurrency, toNumber, calculateTargetAmount } from './currency';
import { getCurrencySymbol } from '@/constants/currencies';
import { IslemWithRelations, Currency, UrunHareket } from '@/types/database';
import { invertCariTransactionType, shouldInvertTransaction } from '@/lib/cariTransactionMapper';

// ============================================================================
// STYLE DEFINITIONS
// ============================================================================

// Ortak border stili
const thinBorder = {
  top: { style: 'thin', color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
  left: { style: 'thin', color: { rgb: 'CCCCCC' } },
  right: { style: 'thin', color: { rgb: 'CCCCCC' } },
};

// Başlık stili (HESAP EKSTRESİ)
const titleStyle = {
  font: { bold: true, sz: 16, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};

// Meta bilgi label stili
const metaLabelStyle = {
  font: { bold: true, sz: 11, color: { rgb: '666666' } },
  alignment: { horizontal: 'left' },
};

// Meta bilgi değer stili
const metaValueStyle = {
  font: { sz: 11, color: { rgb: '333333' } },
  alignment: { horizontal: 'left' },
};

// İşletme adı stili (bold)
const businessNameStyle = {
  font: { bold: true, sz: 11, color: { rgb: '1F4E79' } },
  alignment: { horizontal: 'left' },
};

// Tablo başlık stili (gri arkaplan)
const headerStyle = {
  font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: thinBorder,
};

// Normal hücre stili
const cellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
  border: thinBorder,
};

// Para hücre stili (sağa hizalı)
const currencyCellStyle = {
  font: { sz: 10, color: { rgb: '333333' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// Başlangıç/Son bakiye satır stili
const summaryRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'E7E6E6' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

// Başlangıç/Son bakiye para stili
const summaryCurrencyStyle = {
  font: { bold: true, sz: 10, color: { rgb: '1F4E79' } },
  fill: { fgColor: { rgb: 'E7E6E6' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// Dönem toplamı satır stili
const totalRowStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: thinBorder,
};

// Dönem toplamı para stili
const totalCurrencyStyle = {
  font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5B9BD5' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: thinBorder,
};

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = 'hesap' | 'cari' | 'personel';

export interface ExcelTranslations {
  statement: string;
  accountStatement: string;
  clientStatement: string;
  staffStatement: string;
  account: string;
  client: string;
  staff: string;
  period: string;
  createdAt: string;
  business: string;
  date: string;
  transactionType: string;
  description: string;
  category: string;
  accountColumn: string;
  cariPersonelColumn: string;
  debit: string;
  credit: string;
  debitBalance: string;
  creditBalance: string;
  openingBalance: string;
  periodTotal: string;
  closingBalance: string;
  sheetName: string;
  // Additional translations
  transactionTypes: Record<string, string>;
  statementFileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
  noDataError?: string;
}

export interface ExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  isletmeName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  transactions: IslemWithRelations[];
  allTransactions: IslemWithRelations[]; // Tüm işlemler (başlangıç bakiyesi hesabı için)
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci'; // Cari için
  currentIsletmeId?: string; // Paylaşılan cari: görüntüleyenin isletme_id'si
  typeMismatch?: boolean; // Paylaşılan cari: owner ve viewer cari tipleri farklı mı
  translations: ExcelTranslations; // Lokalizasyon için
}

export interface TransactionRow {
  date: string;
  type: string;
  description: string;
  category: string;
  account: string;
  cariName: string; // Tedarikçi/Müşteri adı
  debit: number | null; // Borç
  credit: number | null; // Alacak
  debitBalance: number | null; // Borç Bakiye
  creditBalance: number | null; // Alacak Bakiye
}

// ============================================================================
// HESAP EKSTRESİ
// ============================================================================

/**
 * Hesap için borç/alacak belirleme
 * Borç = Hesaptan çıkan para (gider, ödeme, transfer out)
 * Alacak = Hesaba giren para (gelir, tahsilat, transfer in)
 */
export function getHesapDebitCredit(
  islem: IslemWithRelations,
  hesapId: string
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  switch (islem.type) {
    case 'gelir':
    case 'cari_tahsilat':
    case 'personel_tahsilat':
    case 'cari_satis':
    case 'cari_alis_iade':
    case 'personel_satis':
      return { debit: null, credit: amount };

    case 'gider':
    case 'cari_odeme':
    case 'personel_odeme':
    case 'cari_alis':
    case 'cari_satis_iade':
    case 'personel_gider':
      return { debit: amount, credit: null };

    case 'transfer':
      // Kaynak hesap mı hedef hesap mı?
      if (islem.hesap_id === hesapId) {
        return { debit: amount, credit: null }; // Çıkış
      } else {
        // Hedef hesap - exchange rate varsa dönüştürülmüş tutar
        const exchangeRate = islem.exchange_rate ? toNumber(islem.exchange_rate) : null;
        const sourceCurrency = islem.source_currency || 'TRY';
        const targetCurrency = islem.target_currency || 'TRY';

        let targetAmount = amount;
        if (exchangeRate && exchangeRate > 0 && sourceCurrency !== targetCurrency) {
          if (sourceCurrency === 'TRY') {
            targetAmount = amount / exchangeRate;
          } else {
            targetAmount = amount * exchangeRate;
          }
        }
        return { debit: null, credit: targetAmount }; // Giriş
      }

    default:
      return { debit: null, credit: null };
  }
}

/**
 * Hesap için başlangıç bakiyesi hesapla
 * Seçilen tarih aralığından önceki tüm işlemlerin etkisini hesapla
 */
export function calculateHesapOpeningBalance(
  allTransactions: IslemWithRelations[],
  hesapId: string,
  currentBalance: number,
  startDate: string
): number {
  // Tüm işlemlerin toplam etkisini hesapla
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    const { debit, credit } = getHesapDebitCredit(islem, hesapId);
    if (credit) totalEffect += credit;
    if (debit) totalEffect -= debit;
  });

  // initial_balance = current_balance - total_effect
  const initialBalance = currentBalance - totalEffect;

  // Şimdi startDate'den önceki işlemlerin etkisini hesapla
  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const { debit, credit } = getHesapDebitCredit(islem, hesapId);
    if (credit) effectBeforeStart += credit;
    if (debit) effectBeforeStart -= debit;
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// CARİ EKSTRESİ
// ============================================================================

/**
 * Ödeme/tahsilat hesap-bacaklıdır: islem.amount HESAP para birimindedir.
 * Cari/personel ekstresi entity para biriminde döküldüğünden, DB bakiye
 * güncellemesiyle (useIslemler updateBalances) aynı dönüşüm uygulanır.
 * Kur bilgisi eksik/geçersizse ham tutara düşer (eski davranış).
 */
function toEntityAmount(islem: IslemWithRelations): number {
  const amount = toNumber(islem.amount);
  const source = islem.source_currency || 'TRY';
  const target = islem.target_currency || 'TRY';
  if (source === target) return amount;
  try {
    return calculateTargetAmount(amount, toNumber(islem.exchange_rate), source, target);
  } catch {
    return amount;
  }
}

/**
 * Cari için borç/alacak belirleme (standart muhasebe kuralları)
 * DB konvansiyonuyla aynı yön ağı: pozitif bakiye = bize borçlu.
 * Bakiyeyi arttıran tipler BORÇ, azaltanlar ALACAK. Cari tipinden bağımsız
 * tek eşleme: bir cari her iki yönde de işlem taşıyabildiğinden (örn. müşteri
 * tipli caride Alış sekmesi) tip dallanması satırları sessizce boş düşürüyordu.
 */
export function getCariDebitCredit(
  islem: IslemWithRelations,
  _cariType: 'musteri' | 'tedarikci'
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  switch (islem.type) {
    case 'cari_satis':      // Alacağımız arttı
    case 'cari_alis_iade':  // Borcumuz azaldı
      return { debit: amount, credit: null };
    case 'cari_odeme':      // Borcumuzu ödedik (hesap-bacaklı → kur dönüşümü)
      return { debit: toEntityAmount(islem), credit: null };
    case 'cari_alis':       // Borcumuz arttı
    case 'cari_satis_iade': // Alacağımız azaldı
      return { debit: null, credit: amount };
    case 'cari_tahsilat':   // Alacağımızı tahsil ettik (hesap-bacaklı → kur dönüşümü)
      return { debit: null, credit: toEntityAmount(islem) };
    default:
      return { debit: null, credit: null };
  }
}

/**
 * Cari için başlangıç bakiyesi hesapla
 * Per-transaction inversion destekler (paylaşılan cariler için)
 */
export function calculateCariOpeningBalance(
  allTransactions: IslemWithRelations[],
  cariType: 'musteri' | 'tedarikci',
  currentBalance: number,
  startDate: string,
  currentIsletmeId?: string,
  typeMismatch?: boolean
): number {
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    // Per-transaction inversion: karşı tarafın işlemi ise tipi çevir
    const needsInvert = shouldInvertTransaction(
      islem.isletme_id, currentIsletmeId, typeMismatch ?? false
    );
    const effectiveIslem = needsInvert
      ? { ...islem, type: invertCariTransactionType(islem.type) }
      : islem;

    const { debit, credit } = getCariDebitCredit(effectiveIslem, cariType);
    // DB konvansiyonu: pozitif = bize borçlu (BORÇ), negatif = biz borçluyuz (ALACAK)
    // Tüm cari tipleri aynı formül: debit arttırır, credit azaltır
    if (debit) totalEffect += debit;
    if (credit) totalEffect -= credit;
  });

  const initialBalance = currentBalance - totalEffect;

  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const needsInvert = shouldInvertTransaction(
      islem.isletme_id, currentIsletmeId, typeMismatch ?? false
    );
    const effectiveIslem = needsInvert
      ? { ...islem, type: invertCariTransactionType(islem.type) }
      : islem;

    const { debit, credit } = getCariDebitCredit(effectiveIslem, cariType);
    if (debit) effectBeforeStart += debit;
    if (credit) effectBeforeStart -= credit;
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// PERSONEL EKSTRESİ
// ============================================================================

/**
 * Personel için borç/alacak belirleme
 * Gider = Alacak (biz borçlandık), Ödeme = Borç (ödedik)
 */
export function getPersonelDebitCredit(
  islem: IslemWithRelations
): { debit: number | null; credit: number | null } {
  const amount = toNumber(islem.amount);

  switch (islem.type) {
    case 'personel_gider':
      return { debit: null, credit: amount }; // Biz borçlandık
    case 'personel_odeme':
      return { debit: toEntityAmount(islem), credit: null }; // Ödedik (hesap-bacaklı → kur dönüşümü)
    case 'personel_tahsilat':
      return { debit: null, credit: toEntityAmount(islem) }; // Personelden alacak (hesap-bacaklı → kur dönüşümü)
    case 'personel_satis':
      return { debit: amount, credit: null }; // Personele satış (personel bize borçlandı)
    default:
      return { debit: null, credit: null };
  }
}

/**
 * Personel için başlangıç bakiyesi hesapla
 */
export function calculatePersonelOpeningBalance(
  allTransactions: IslemWithRelations[],
  currentBalance: number,
  startDate: string
): number {
  let totalEffect = 0;

  allTransactions.forEach((islem) => {
    const { debit, credit } = getPersonelDebitCredit(islem);
    if (credit) totalEffect -= credit; // Borç arttı
    if (debit) totalEffect += debit; // Ödedik
  });

  const initialBalance = currentBalance - totalEffect;

  const transactionsBeforeStart = allTransactions.filter(
    (t) => t.date < startDate
  );

  let effectBeforeStart = 0;
  transactionsBeforeStart.forEach((islem) => {
    const { debit, credit } = getPersonelDebitCredit(islem);
    if (credit) effectBeforeStart -= credit;
    if (debit) effectBeforeStart += debit;
  });

  return initialBalance + effectBeforeStart;
}

// ============================================================================
// EXCEL OLUŞTURMA
// ============================================================================

/**
 * Ana export fonksiyonu
 */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  const {
    entityType,
    entityId,
    entityName,
    entityCurrency,
    isletmeName,
    startDate,
    endDate,
    transactions,
    allTransactions,
    currentBalance,
    cariType,
    currentIsletmeId,
    typeMismatch,
    translations: t,
  } = options;

  if (transactions.length === 0) {
    throw new Error(t.noDataError || 'No data to export');
  }

  // Başlangıç bakiyesi hesapla
  let openingBalance: number;
  switch (entityType) {
    case 'hesap':
      openingBalance = calculateHesapOpeningBalance(
        allTransactions,
        entityId,
        currentBalance,
        startDate
      );
      break;
    case 'cari':
      openingBalance = calculateCariOpeningBalance(
        allTransactions,
        cariType || 'tedarikci',
        currentBalance,
        startDate,
        currentIsletmeId,
        typeMismatch
      );
      break;
    case 'personel':
      openingBalance = calculatePersonelOpeningBalance(
        allTransactions,
        currentBalance,
        startDate
      );
      break;
    default:
      openingBalance = 0;
  }

  // İşlemleri tarih sırasına göre sırala (eskiden yeniye)
  const sortedTransactions = [...transactions].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Excel satırlarını oluştur
  const rows: TransactionRow[] = [];
  let runningBalance = openingBalance;

  // Hesap adını al (işlem için)
  const getAccountName = (islem: IslemWithRelations): string => {
    if (islem.hesap?.name) return islem.hesap.name;
    if (islem.hedef_hesap?.name) return islem.hedef_hesap.name;
    return '';
  };

  sortedTransactions.forEach((islem) => {
    let debit: number | null = null;
    let credit: number | null = null;
    let effectiveType = islem.type;

    switch (entityType) {
      case 'hesap':
        ({ debit, credit } = getHesapDebitCredit(islem, entityId));
        break;
      case 'cari': {
        // Per-transaction inversion: karşı tarafın işlemi ise tipi çevir
        const needsInvert = shouldInvertTransaction(
          islem.isletme_id, currentIsletmeId, typeMismatch ?? false
        );
        if (needsInvert) {
          effectiveType = invertCariTransactionType(islem.type);
        }
        ({ debit, credit } = getCariDebitCredit(
          { ...islem, type: effectiveType } as IslemWithRelations,
          cariType || 'tedarikci'
        ));
        break;
      }
      case 'personel':
        ({ debit, credit } = getPersonelDebitCredit(islem));
        break;
    }

    // Running balance güncelle
    // Borç bakiyeli: cari + personel (DB'de pozitif = bize borçlu)
    // Alacak bakiyeli: hesap (DB'de pozitif = varlık)
    const isDebitNormal = entityType === 'cari' || entityType === 'personel';
    if (isDebitNormal) {
      if (debit) runningBalance += debit;
      if (credit) runningBalance -= credit;
    } else {
      if (credit) runningBalance += credit;
      if (debit) runningBalance -= debit;
    }

    // Borç/Alacak bakiye hesapla
    let debitBalance: number | null;
    let creditBalance: number | null;
    if (isDebitNormal) {
      // Pozitif bakiye = BORÇ (karşı taraf bize borçlu)
      debitBalance = runningBalance > 0 ? runningBalance : null;
      creditBalance = runningBalance < 0 ? Math.abs(runningBalance) : null;
    } else {
      debitBalance = runningBalance < 0 ? Math.abs(runningBalance) : null;
      creditBalance = runningBalance >= 0 ? runningBalance : null;
    }

    rows.push({
      date: formatDateShort(islem.date),
      type: t.transactionTypes[effectiveType] || effectiveType,
      description: islem.description || '',
      category: islem.kategori?.name || '',
      account: getAccountName(islem),
      cariName: islem.cari?.name || (islem.personel ? `${islem.personel.first_name} ${islem.personel.last_name ?? ''}`.trim() : ''),
      debit,
      credit,
      debitBalance,
      creditBalance,
    });
  });

  // Toplamları hesapla
  const totalDebit = rows.reduce((sum, r) => sum + (r.debit || 0), 0);
  const totalCredit = rows.reduce((sum, r) => sum + (r.credit || 0), 0);
  const closingBalance = runningBalance;
  const isDebitNormalEntity = entityType === 'cari' || entityType === 'personel';
  const closingDebitBalance = isDebitNormalEntity
    ? (closingBalance > 0 ? closingBalance : null)
    : (closingBalance < 0 ? Math.abs(closingBalance) : null);
  const closingCreditBalance = isDebitNormalEntity
    ? (closingBalance < 0 ? Math.abs(closingBalance) : null)
    : (closingBalance >= 0 ? closingBalance : null);

  // Excel verisi oluştur
  const currency = entityCurrency || 'TRY';
  const formatAmount = (val: number | null) =>
    val !== null ? formatCurrency(val, currency) : '';

  // Başlangıç bakiyesi için borç/alacak bakiye
  const openingDebitBalance = isDebitNormalEntity
    ? (openingBalance > 0 ? openingBalance : null)
    : (openingBalance < 0 ? Math.abs(openingBalance) : null);
  const openingCreditBalance = isDebitNormalEntity
    ? (openingBalance < 0 ? Math.abs(openingBalance) : null)
    : (openingBalance >= 0 ? openingBalance : null);

  // Entity tipi label ve başlık
  let entityTypeLabel: string;
  let statementTitle: string;
  switch (entityType) {
    case 'hesap':
      entityTypeLabel = t.account;
      statementTitle = t.accountStatement;
      break;
    case 'cari':
      entityTypeLabel = t.client;
      statementTitle = t.clientStatement;
      break;
    case 'personel':
      entityTypeLabel = t.staff;
      statementTitle = t.staffStatement;
      break;
    default:
      entityTypeLabel = t.account;
      statementTitle = t.accountStatement;
  }

  // Workbook ve worksheet oluştur
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // Satır sayacı
  let rowIdx = 0;

  // ============ BAŞLIK BÖLÜMÜ ============
  // Row 0: Başlık
  ws['A1'] = { v: statementTitle, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]; // A1:I1 birleştir
  rowIdx++;

  // Row 1: Boş satır
  rowIdx++;

  // Row 2: Entity adı
  ws['A3'] = { v: `${entityTypeLabel}:`, s: metaLabelStyle };
  ws['B3'] = { v: entityName, s: businessNameStyle };
  rowIdx++;

  // Row 3: Dönem
  ws['A4'] = { v: `${t.period}:`, s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`, s: metaValueStyle };
  rowIdx++;

  // Row 4: Oluşturulma tarihi
  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };
  rowIdx++;

  // Row 5: İşletme
  ws['A6'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B6'] = { v: isletmeName, s: businessNameStyle };
  rowIdx++;

  // Row 6: Boş satır
  rowIdx++;

  // ============ TABLO BAŞLIKLARI ============
  const headerRow = 8;
  const headers = [t.date, t.transactionType, t.description, t.category, t.accountColumn, t.cariPersonelColumn, t.debit, t.credit, t.debitBalance, t.creditBalance];
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  headers.forEach((header, i) => {
    ws[`${cols[i]}${headerRow}`] = { v: header, s: headerStyle };
  });

  // ============ BAŞLANGIÇ BAKİYESİ ============
  const openingRow = 9;
  ws[`A${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${openingRow}`] = { v: t.openingBalance, s: summaryRowStyle };
  ws[`D${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`E${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`F${openingRow}`] = { v: '', s: summaryRowStyle };
  ws[`G${openingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`H${openingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`I${openingRow}`] = { v: formatAmount(openingDebitBalance), s: summaryCurrencyStyle };
  ws[`J${openingRow}`] = { v: formatAmount(openingCreditBalance), s: summaryCurrencyStyle };

  // ============ İŞLEMLER ============
  const dataRowStart = 10;
  rows.forEach((r, i) => {
    const rowNum = dataRowStart + i;
    ws[`A${rowNum}`] = { v: r.date, s: cellStyle };
    ws[`B${rowNum}`] = { v: r.type, s: cellStyle };
    ws[`C${rowNum}`] = { v: r.description, s: cellStyle };
    ws[`D${rowNum}`] = { v: r.category, s: cellStyle };
    ws[`E${rowNum}`] = { v: r.account, s: cellStyle };
    ws[`F${rowNum}`] = { v: r.cariName, s: cellStyle };
    ws[`G${rowNum}`] = { v: formatAmount(r.debit), s: currencyCellStyle };
    ws[`H${rowNum}`] = { v: formatAmount(r.credit), s: currencyCellStyle };
    ws[`I${rowNum}`] = { v: formatAmount(r.debitBalance), s: currencyCellStyle };
    ws[`J${rowNum}`] = { v: formatAmount(r.creditBalance), s: currencyCellStyle };
  });

  // ============ DÖNEM TOPLAMI ============
  const totalRow = dataRowStart + rows.length;
  ws[`A${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`B${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`C${totalRow}`] = { v: t.periodTotal, s: totalRowStyle };
  ws[`D${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`E${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`F${totalRow}`] = { v: '', s: totalRowStyle };
  ws[`G${totalRow}`] = { v: formatAmount(totalDebit), s: totalCurrencyStyle };
  ws[`H${totalRow}`] = { v: formatAmount(totalCredit), s: totalCurrencyStyle };
  ws[`I${totalRow}`] = { v: '', s: totalCurrencyStyle };
  ws[`J${totalRow}`] = { v: '', s: totalCurrencyStyle };

  // ============ SON BAKİYE ============
  const closingRow = totalRow + 1;
  ws[`A${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${closingRow}`] = { v: t.closingBalance, s: summaryRowStyle };
  ws[`D${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`E${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`F${closingRow}`] = { v: '', s: summaryRowStyle };
  ws[`G${closingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`H${closingRow}`] = { v: '', s: summaryCurrencyStyle };
  ws[`I${closingRow}`] = { v: formatAmount(closingDebitBalance), s: summaryCurrencyStyle };
  ws[`J${closingRow}`] = { v: formatAmount(closingCreditBalance), s: summaryCurrencyStyle };

  // Worksheet aralığını ayarla
  ws['!ref'] = `A1:J${closingRow}`;

  // Sütun genişliklerini ayarla
  ws['!cols'] = [
    { wch: 12 }, // Tarih
    { wch: 18 }, // İşlem Tipi
    { wch: 35 }, // Açıklama
    { wch: 15 }, // Kategori
    { wch: 15 }, // Hesap
    { wch: 20 }, // Cari/Personel
    { wch: 14 }, // Borç
    { wch: 14 }, // Alacak
    { wch: 14 }, // Borç Bakiye
    { wch: 14 }, // Alacak Bakiye
  ];

  // Satır yüksekliklerini ayarla
  ws['!rows'] = [
    { hpt: 24 }, // Başlık satırı
  ];

  // Worksheet'i workbook'a ekle
  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  // Base64 olarak export et
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // Dosya adı oluştur
  const safeEntityName = entityName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const fileName = `${safeEntityName}_${t.statementFileName}_${startDate}_${endDate}.xlsx`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  // Dosyayı yaz
  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Paylaş
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: t.shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(t.sharingNotSupported);
  }
}

// ============================================================================
// ÜRÜN HAREKETLER EXCEL EXPORT
// ============================================================================

export interface UrunExcelTranslations {
  productMovements: string;
  product: string;
  period: string;
  createdAt: string;
  business: string;
  date: string;
  movementType: string;
  client: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  description: string;
  totalIn: string;
  totalOut: string;
  totalAdjustment: string;
  netChange: string;
  periodSummary: string;
  sheetName: string;
  fileName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
  movementTypes: Record<string, string>;
  noDataError?: string;
}

export interface UrunHareketExportRow {
  date: string;
  movementType: string;
  cariName: string;
  quantity: number;
  unitLabel: string;
  unitPrice: number | null;
  subtotal: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  total: number | null;
  description: string;
}

export interface UrunExportOptions {
  productName: string;
  productCode?: string;
  productUnit: string;
  productCurrency: Currency | string;
  isletmeName: string;
  startDate: string;
  endDate: string;
  hareketler: (UrunHareket & { cari?: { id: string; name: string } | null; islemDate?: string | null })[];
  translations: UrunExcelTranslations;
}

/**
 * Ürün hareketlerini Excel olarak export eder.
 * Kolonlar: Tarih, Hareket Tipi, Cari, Miktar, Birim, Birim Fiyat, Ara Toplam, KDV %, KDV Tutar, Toplam, Açıklama
 * + Dönem Özeti satırları
 */
export async function exportUrunHareketlerToExcel(options: UrunExportOptions): Promise<void> {
  const {
    productName,
    productCode,
    productUnit,
    productCurrency,
    isletmeName,
    startDate,
    endDate,
    hareketler,
    translations: t,
  } = options;

  if (hareketler.length === 0) {
    throw new Error(t.noDataError || 'No data to export');
  }

  const currency = productCurrency || 'TRY';

  // Para hücrelerini Excel'de GERÇEK SAYI (SUM/sıralama/grafik çalışsın) + para-birimi
  // gösterim formatıyla yaz. Sembol format koduna gömülür; sayı değeri ham kalır.
  const moneyFmt = `"${getCurrencySymbol(currency)}"#,##0.00`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SheetJS hücre nesnesi
  const moneyCell = (val: number | null | undefined, style: any): any =>
    val !== null && val !== undefined
      ? { v: val, t: 'n', z: moneyFmt, s: style }
      : { v: '', s: style };

  // İŞ TARİHİNE göre sırala (islem.date varsa onu, yoksa created_at) — ekran listesiyle aynı eksen
  const sorted = [...hareketler].sort((a, b) =>
    (a.islemDate ?? a.created_at).localeCompare(b.islemDate ?? b.created_at)
  );

  // Satırları oluştur
  const rows: UrunHareketExportRow[] = sorted.map((h) => {
    const birimFiyat = h.birim_fiyat != null ? toNumber(h.birim_fiyat) : null;
    const kdvOrani = h.kdv_orani != null ? toNumber(h.kdv_orani) : null;
    const subtotal = birimFiyat != null ? h.miktar * birimFiyat : null;
    const kdvAmount = subtotal != null && kdvOrani != null ? subtotal * (kdvOrani / 100) : null;
    const total = subtotal != null ? subtotal + (kdvAmount ?? 0) : null;

    return {
      date: formatDateShort(h.islemDate ?? h.created_at),
      movementType: t.movementTypes[h.hareket_tipi] || h.hareket_tipi,
      cariName: h.cari?.name || '',
      quantity: h.hareket_tipi === 'cikis' ? -Math.abs(h.miktar) : h.miktar,
      unitLabel: productUnit,
      unitPrice: birimFiyat,
      subtotal,
      vatRate: kdvOrani,
      vatAmount: kdvAmount,
      total,
      description: h.aciklama || '',
    };
  });

  // Toplamları hesapla
  const totalIn = sorted
    .filter(h => h.hareket_tipi === 'giris')
    .reduce((sum, h) => sum + Math.abs(h.miktar), 0);
  const totalOut = sorted
    .filter(h => h.hareket_tipi === 'cikis')
    .reduce((sum, h) => sum + Math.abs(h.miktar), 0);
  const totalAdjustment = sorted
    .filter(h => h.hareket_tipi === 'duzeltme')
    .reduce((sum, h) => sum + h.miktar, 0);
  const hasAdjustments = sorted.some(h => h.hareket_tipi === 'duzeltme');
  const totalInAmount = rows
    .filter(r => r.quantity > 0)
    .reduce((sum, r) => sum + (r.total || 0), 0);
  const totalOutAmount = rows
    .filter(r => r.quantity < 0)
    .reduce((sum, r) => sum + Math.abs(r.total || 0), 0);

  // Workbook oluştur
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {};

  // ============ BAŞLIK BÖLÜMÜ ============
  const productLabel = productCode ? `${productName} (${productCode})` : productName;
  ws['A1'] = { v: t.productMovements, s: titleStyle };
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];

  ws['A3'] = { v: `${t.product}:`, s: metaLabelStyle };
  ws['B3'] = { v: productLabel, s: businessNameStyle };

  ws['A4'] = { v: `${t.period}:`, s: metaLabelStyle };
  ws['B4'] = { v: `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`, s: metaValueStyle };

  ws['A5'] = { v: `${t.createdAt}:`, s: metaLabelStyle };
  ws['B5'] = { v: formatDateTime(new Date().toISOString()), s: metaValueStyle };

  ws['A6'] = { v: `${t.business}:`, s: metaLabelStyle };
  ws['B6'] = { v: isletmeName, s: businessNameStyle };

  // ============ TABLO BAŞLIKLARI ============
  const headerRow = 8;
  const headers = [
    t.date, t.movementType, t.client, t.quantity, t.unit,
    t.unitPrice, t.subtotal, t.vatRate, t.vatAmount, t.total, t.description,
  ];
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

  headers.forEach((header, i) => {
    ws[`${cols[i]}${headerRow}`] = { v: header, s: headerStyle };
  });

  // ============ VERİ SATIRLARI ============
  const dataRowStart = 9;
  rows.forEach((r, i) => {
    const rowNum = dataRowStart + i;
    ws[`A${rowNum}`] = { v: r.date, s: cellStyle };
    ws[`B${rowNum}`] = { v: r.movementType, s: cellStyle };
    ws[`C${rowNum}`] = { v: r.cariName, s: cellStyle };
    ws[`D${rowNum}`] = { v: r.quantity, s: currencyCellStyle };
    ws[`E${rowNum}`] = { v: r.unitLabel, s: cellStyle };
    ws[`F${rowNum}`] = moneyCell(r.unitPrice, currencyCellStyle);
    ws[`G${rowNum}`] = moneyCell(r.subtotal, currencyCellStyle);
    ws[`H${rowNum}`] = { v: r.vatRate != null ? `%${r.vatRate}` : '', s: cellStyle };
    ws[`I${rowNum}`] = moneyCell(r.vatAmount, currencyCellStyle);
    ws[`J${rowNum}`] = moneyCell(r.total, currencyCellStyle);
    ws[`K${rowNum}`] = { v: r.description, s: cellStyle };
  });

  // ============ DÖNEM ÖZETİ ============
  const summaryStartRow = dataRowStart + rows.length + 1;

  // Toplam Giriş
  ws[`A${summaryStartRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${summaryStartRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${summaryStartRow}`] = { v: t.totalIn, s: summaryRowStyle };
  ws[`D${summaryStartRow}`] = { v: totalIn, s: summaryCurrencyStyle };
  for (let i = 4; i <= 8; i++) ws[`${cols[i]}${summaryStartRow}`] = { v: '', s: summaryRowStyle };
  ws[`J${summaryStartRow}`] = moneyCell(totalInAmount, summaryCurrencyStyle);
  ws[`K${summaryStartRow}`] = { v: '', s: summaryRowStyle };

  // Toplam Çıkış
  const outRow = summaryStartRow + 1;
  ws[`A${outRow}`] = { v: '', s: summaryRowStyle };
  ws[`B${outRow}`] = { v: '', s: summaryRowStyle };
  ws[`C${outRow}`] = { v: t.totalOut, s: summaryRowStyle };
  ws[`D${outRow}`] = { v: -totalOut, s: summaryCurrencyStyle };
  for (let i = 4; i <= 8; i++) ws[`${cols[i]}${outRow}`] = { v: '', s: summaryRowStyle };
  ws[`J${outRow}`] = moneyCell(totalOutAmount, summaryCurrencyStyle);
  ws[`K${outRow}`] = { v: '', s: summaryRowStyle };

  // Düzeltme (only if there are adjustment rows)
  let nextRow = outRow + 1;
  if (hasAdjustments) {
    const adjRow = nextRow;
    ws[`A${adjRow}`] = { v: '', s: summaryRowStyle };
    ws[`B${adjRow}`] = { v: '', s: summaryRowStyle };
    ws[`C${adjRow}`] = { v: t.totalAdjustment, s: summaryRowStyle };
    ws[`D${adjRow}`] = { v: totalAdjustment, s: summaryCurrencyStyle };
    for (let i = 4; i <= 8; i++) ws[`${cols[i]}${adjRow}`] = { v: '', s: summaryRowStyle };
    ws[`J${adjRow}`] = { v: '', s: summaryRowStyle };
    ws[`K${adjRow}`] = { v: '', s: summaryRowStyle };
    nextRow = adjRow + 1;
  }

  // Net Değişim
  const netRow = nextRow;
  ws[`A${netRow}`] = { v: '', s: totalRowStyle };
  ws[`B${netRow}`] = { v: '', s: totalRowStyle };
  ws[`C${netRow}`] = { v: t.netChange, s: totalRowStyle };
  ws[`D${netRow}`] = { v: totalIn - totalOut + totalAdjustment, s: totalCurrencyStyle };
  for (let i = 4; i <= 8; i++) ws[`${cols[i]}${netRow}`] = { v: '', s: totalRowStyle };
  ws[`J${netRow}`] = moneyCell(totalInAmount - totalOutAmount, totalCurrencyStyle);
  ws[`K${netRow}`] = { v: '', s: totalRowStyle };

  // Worksheet aralığını ayarla
  ws['!ref'] = `A1:K${netRow}`;

  // Sütun genişlikleri
  ws['!cols'] = [
    { wch: 12 }, // Tarih
    { wch: 14 }, // Hareket Tipi
    { wch: 20 }, // Cari
    { wch: 10 }, // Miktar
    { wch: 10 }, // Birim
    { wch: 14 }, // Birim Fiyat
    { wch: 14 }, // Ara Toplam
    { wch: 8 },  // KDV %
    { wch: 14 }, // KDV Tutar
    { wch: 14 }, // Toplam
    { wch: 25 }, // Açıklama
  ];

  ws['!rows'] = [{ hpt: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, t.sheetName);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const safeName = productName.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const fileName = `${safeName}_${t.fileName}_${startDate}_${endDate}.xlsx`;
  const filePath = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: t.shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(t.sharingNotSupported);
  }
}

// ============================================================================
// ÜRÜN LİSTESİ EXPORT
// ============================================================================

export interface UrunListeExcelTranslations {
  title: string;
  columns: {
    name: string;
    code: string;
    category: string;
    unit: string;
    stock: string;
    purchasePrice: string;
    salePrice: string;
    vatRate: string;
  };
  fileName: string;
  isletmeName: string;
  shareDialogTitle: string;
  sharingNotSupported: string;
  noDataError: string;
}

export interface UrunListeItem {
  ad: string;
  kod: string | null;
  kategori: string | null;
  birim: string;
  miktar: number;
  alis_fiyati: number;
  satis_fiyati: number;
  kdv_orani: number;
  currency: string;
}

export interface UrunListeExportOptions {
  urunler: UrunListeItem[];
  translations: UrunListeExcelTranslations;
}

export async function exportUrunListesiToExcel(options: UrunListeExportOptions): Promise<void> {
  const { urunler, translations: t } = options;

  if (urunler.length === 0) {
    throw new Error(t.noDataError);
  }

  const headers = [
    t.columns.name,
    t.columns.code,
    t.columns.category,
    t.columns.unit,
    t.columns.stock,
    t.columns.purchasePrice,
    t.columns.salePrice,
    t.columns.vatRate,
  ];

  const dataRows = urunler.map((u) => [
    u.ad,
    u.kod || '',
    u.kategori || '',
    u.birim,
    u.miktar,
    u.alis_fiyati > 0 ? formatCurrency(u.alis_fiyati, u.currency) : '',
    u.satis_fiyati > 0 ? formatCurrency(u.satis_fiyati, u.currency) : '',
    `%${u.kdv_orani}`,
  ]);

  const wsData = [
    [{ v: t.title, s: titleStyle }],
    [{ v: t.isletmeName, s: { font: { sz: 11, color: { rgb: '666666' } } } }],
    [],
    headers.map((h) => ({ v: h, s: headerStyle })),
    ...dataRows.map((row) =>
      row.map((cell) => ({
        v: cell,
        s: cellStyle,
      }))
    ),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
  ];

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, t.title);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const safeName = t.fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = `${FileSystem.cacheDirectory}${safeName}.xlsx`;

  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: t.shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(t.sharingNotSupported);
  }
}

// ============================================================================
// GENEL VARLIK LİSTESİ EXPORT (cari + personel ana sayfa "anlık liste")
// Zengin başlık (tarih/anlık-not/marka) + kayıt sayısı + aktif filtre +
// para-birimi bazlı bakiye özeti + autofilter + gerçek-sayı bakiye hücreleri.
// ============================================================================

// Not sat. stili (anlık/marka bilgilendirmesi — italik, soluk gri)
const noteStyle = {
  font: { italic: true, sz: 10, color: { rgb: '888888' } },
  alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
};

// Bir liste hücresi: düz metin YA DA para birimli sayı (Excel'de gerçek sayı)
export type EntityListCell = string | { amount: number | null; currency: string };

export interface EntityListColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

// Özet satırı — para birimi bazlı toplam (gerçek sayı olarak yazılır)
export interface EntityListSummaryLine {
  label: string;
  amount: number;
  currency: string;
}

export interface EntityListMetaLabels {
  business: string;
  createdAt: string;
  recordCount: string;
  filter: string;
  summary: string;
  snapshotNote: string;
  generatedByApp: string;
}

export interface EntityListExportOptions {
  title: string;
  isletmeName: string;
  columns: EntityListColumn[];
  rows: EntityListCell[][];
  summary?: EntityListSummaryLine[];
  filterText?: string; // "Müşteri · Arama: ahmet" gibi
  labels: EntityListMetaLabels;
  fileName: string; // uzantısız
  shareDialogTitle: string;
  sharingNotSupported: string;
  noDataError: string;
}

/** Para birimli gerçek-sayı hücre (SUM/sıralama/grafik çalışsın; sembol format koduna gömülür) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SheetJS hücre nesnesi
function moneyNumberCell(amount: number | null, currency: string, style: any): any {
  if (amount === null || amount === undefined) return { v: '', s: style };
  const fmt = `"${getCurrencySymbol(currency)}"#,##0.00`;
  return { v: amount, t: 'n', z: fmt, s: style };
}

export async function exportEntityListToExcel(options: EntityListExportOptions): Promise<void> {
  const {
    title,
    isletmeName,
    columns,
    rows,
    summary,
    filterText,
    labels,
    fileName,
    shareDialogTitle,
    sharingNotSupported,
    noDataError,
  } = options;

  if (rows.length === 0) {
    throw new Error(noDataError);
  }

  const lastCol = columns.length - 1;
  const cellAt = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let r = 0;

  // ── Başlık ──
  ws[cellAt(r, 0)] = { v: title, s: titleStyle };
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r++;

  // ── Meta satırları (etiket + değer) ──
  const metaRows: { label: string; value: string; bold?: boolean }[] = [
    { label: labels.business, value: isletmeName, bold: true },
    { label: labels.createdAt, value: formatDateTime(new Date().toISOString()) },
    { label: labels.recordCount, value: String(rows.length) },
  ];
  if (filterText) metaRows.push({ label: labels.filter, value: filterText });

  metaRows.forEach((m) => {
    ws[cellAt(r, 0)] = { v: `${m.label}:`, s: metaLabelStyle };
    ws[cellAt(r, 1)] = { v: m.value, s: m.bold ? businessNameStyle : metaValueStyle };
    r++;
  });

  // ── Anlık (snapshot) notu ──
  ws[cellAt(r, 0)] = { v: labels.snapshotNote, s: noteStyle };
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  r++;

  // Boş satır
  r++;

  // ── Tablo başlıkları ──
  const headerR = r;
  columns.forEach((col, c) => {
    ws[cellAt(headerR, c)] = { v: col.header, s: headerStyle };
  });
  r++;

  // ── Veri satırları ──
  rows.forEach((row) => {
    columns.forEach((col, c) => {
      const cell = row[c];
      const baseStyle = col.align === 'right' ? currencyCellStyle : cellStyle;
      if (cell && typeof cell === 'object') {
        ws[cellAt(r, c)] = moneyNumberCell(cell.amount, cell.currency, baseStyle);
      } else {
        ws[cellAt(r, c)] = { v: (cell as string) ?? '', s: baseStyle };
      }
    });
    r++;
  });
  const dataEndR = r - 1;

  // ── Özet (para birimi bazlı toplamlar) ──
  if (summary && summary.length > 0) {
    r++; // boş satır
    ws[cellAt(r, 0)] = { v: labels.summary, s: summaryRowStyle };
    for (let c = 1; c <= lastCol; c++) ws[cellAt(r, c)] = { v: '', s: summaryRowStyle };
    r++;
    summary.forEach((line) => {
      ws[cellAt(r, 0)] = { v: line.label, s: summaryRowStyle };
      for (let c = 1; c < lastCol; c++) ws[cellAt(r, c)] = { v: '', s: summaryRowStyle };
      ws[cellAt(r, lastCol)] = moneyNumberCell(line.amount, line.currency, summaryCurrencyStyle);
      r++;
    });
  }

  // ── Marka / oluşturan-uygulama notu ──
  r++; // boş satır
  ws[cellAt(r, 0)] = { v: labels.generatedByApp, s: noteStyle };
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  const lastR = r;

  // Worksheet meta
  ws['!ref'] = `A1:${cellAt(lastR, lastCol)}`;
  ws['!merges'] = merges;
  ws['!cols'] = columns.map((col) => ({ wch: col.width }));
  ws['!rows'] = [{ hpt: 24 }];
  // Başlık satırına otomatik filtre (sıralanabilir/filtrelenebilir kolonlar)
  ws['!autofilter'] = {
    ref: `${cellAt(headerR, 0)}:${cellAt(dataEndR, lastCol)}`,
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);

  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = `${FileSystem.cacheDirectory}${safeName}.xlsx`;

  await FileSystem.writeAsStringAsync(filePath, wbout, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(filePath, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: shareDialogTitle,
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error(sharingNotSupported);
  }
}
