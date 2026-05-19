import { formatCurrency, toNumber } from './currency';
import { formatDateShort } from './date';
import { IslemWithRelations, Currency } from '@/types/database';
import {
  EntityType,
  TransactionRow,
  getHesapDebitCredit,
  getCariDebitCredit,
  getPersonelDebitCredit,
  calculateHesapOpeningBalance,
  calculateCariOpeningBalance,
  calculatePersonelOpeningBalance,
} from './excelExport';
import { invertCariTransactionType, shouldInvertTransaction } from './cariTransactionMapper';

export interface PdfExportOptions {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entityCurrency?: Currency | string;
  isletmeName: string;
  startDate: string;
  endDate: string;
  transactions: IslemWithRelations[];
  allTransactions: IslemWithRelations[];
  currentBalance: number;
  cariType?: 'musteri' | 'tedarikci';
  currentIsletmeId?: string;
  typeMismatch?: boolean;
  phone?: string;
  translations: {
    statementTitle: string;
    entityLabel: string;
    phone: string;
    date: string;
    time: string;
    balance: string;
    dateColumn: string;
    typeColumn: string;
    descriptionColumn: string;
    debitColumn: string;
    creditColumn: string;
    openingBalance: string;
    periodTotal: string;
    closingBalance: string;
    totalRecords: string;
    page: string;
    period: string;
    transactionTypes: Record<string, string>;
  };
}

export interface PdfStatementData {
  rows: TransactionRow[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export function prepareStatementData(options: PdfExportOptions): PdfStatementData {
  const {
    entityType, entityId, transactions, allTransactions,
    currentBalance, startDate, cariType, currentIsletmeId, typeMismatch,
    translations,
  } = options;

  let openingBalance = 0;
  if (entityType === 'hesap') {
    openingBalance = calculateHesapOpeningBalance(allTransactions, entityId, currentBalance, startDate);
  } else if (entityType === 'cari' && cariType) {
    openingBalance = calculateCariOpeningBalance(allTransactions, cariType, currentBalance, startDate, currentIsletmeId, typeMismatch);
  } else if (entityType === 'personel') {
    openingBalance = calculatePersonelOpeningBalance(allTransactions, currentBalance, startDate);
  }

  const rows: TransactionRow[] = [];
  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  transactions.forEach((islem) => {
    let debitCredit: { debit: number | null; credit: number | null };
    let effectiveIslem = islem;

    if (entityType === 'hesap') {
      debitCredit = getHesapDebitCredit(islem, entityId);
    } else if (entityType === 'cari' && cariType) {
      const needsInvert = shouldInvertTransaction(islem.isletme_id, currentIsletmeId, typeMismatch ?? false);
      if (needsInvert) {
        effectiveIslem = { ...islem, type: invertCariTransactionType(islem.type) };
      }
      debitCredit = getCariDebitCredit(effectiveIslem, cariType);
    } else {
      debitCredit = getPersonelDebitCredit(islem);
    }

    const { debit, credit } = debitCredit;

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

    if (debit) totalDebit += debit;
    if (credit) totalCredit += credit;

    const typeName = translations.transactionTypes[effectiveIslem.type] || effectiveIslem.type;

    rows.push({
      date: formatDateShort(islem.date),
      type: typeName,
      description: islem.description || '',
      category: islem.kategori?.name || '',
      account: islem.hesap?.name || '',
      cariName: islem.cari?.name ||
        (islem.personel
          ? `${islem.personel?.first_name || ''} ${islem.personel?.last_name || ''}`.trim()
          : ''),
      debit,
      credit,
      debitBalance: isDebitNormal
        ? (runningBalance > 0 ? runningBalance : null)
        : (runningBalance < 0 ? Math.abs(runningBalance) : null),
      creditBalance: isDebitNormal
        ? (runningBalance < 0 ? Math.abs(runningBalance) : null)
        : (runningBalance >= 0 ? runningBalance : null),
    });
  });

  return { rows, openingBalance, totalDebit, totalCredit, closingBalance: runningBalance };
}

function fmt(amount: number | null, currency?: Currency | string): string {
  if (amount === null || amount === 0) return '';
  return formatCurrency(Math.abs(amount), currency);
}

export function generatePdfHtml(options: PdfExportOptions): string {
  const { entityType, entityName, isletmeName, startDate, endDate, entityCurrency, cariType, phone, translations } = options;
  const data = prepareStatementData(options);
  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const startFmt = formatDateShort(startDate);
  const endFmt = formatDateShort(endDate);

  // Borç bakiyeli: cari + personel (DB'de pozitif = bize borçlu → BORÇ kolonu)
  // Alacak bakiyeli: hesap (DB'de pozitif = varlık → ALACAK kolonu)
  const isDebitNormal = entityType === 'cari' || entityType === 'personel';
  let openingDebit: string;
  let openingCredit: string;
  let closingDebit: string;
  let closingCredit: string;
  if (isDebitNormal) {
    openingDebit = data.openingBalance > 0 ? fmt(data.openingBalance, entityCurrency) : '';
    openingCredit = data.openingBalance < 0 ? fmt(Math.abs(data.openingBalance), entityCurrency) : '';
    closingDebit = data.closingBalance > 0 ? fmt(data.closingBalance, entityCurrency) : '';
    closingCredit = data.closingBalance < 0 ? fmt(Math.abs(data.closingBalance), entityCurrency) : '';
  } else {
    openingDebit = data.openingBalance < 0 ? fmt(Math.abs(data.openingBalance), entityCurrency) : '';
    openingCredit = data.openingBalance >= 0 ? fmt(data.openingBalance, entityCurrency) : '';
    closingDebit = data.closingBalance < 0 ? fmt(Math.abs(data.closingBalance), entityCurrency) : '';
    closingCredit = data.closingBalance >= 0 ? fmt(data.closingBalance, entityCurrency) : '';
  }

  const transactionRows = data.rows.map((row) => `
    <tr>
      <td>${row.date}</td>
      <td>${row.type}</td>
      <td class="desc">${row.description}</td>
      <td class="amount">${fmt(row.debit, entityCurrency)}</td>
      <td class="amount">${fmt(row.credit, entityCurrency)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; padding: 24px; font-size: 10px; color: #333; }
  .header { margin-bottom: 16px; border-bottom: 2px solid #4472C4; padding-bottom: 12px; }
  .header h1 { color: #1F4E79; font-size: 15px; margin-bottom: 4px; }
  .header h2 { color: #666; font-size: 11px; font-weight: normal; margin-bottom: 10px; }
  .header-divider { height: 1px; background: #D0D0D0; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 3px 24px; }
  .meta-item { display: flex; gap: 4px; }
  .meta-label { font-weight: 600; color: #666; min-width: 50px; }
  .meta-value { color: #333; }
  .meta-value.balance { font-weight: 700; color: #1F4E79; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: #4472C4; color: white; padding: 6px 8px; font-size: 9px; text-align: center; border: 1px solid #3566A8; }
  tbody td { border: 1px solid #D0D0D0; padding: 5px 8px; font-size: 9px; vertical-align: top; }
  .desc { word-break: break-word; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .summary-row td { background: #E7E6E6; font-weight: 600; color: #1F4E79; }
  .total-row td { background: #5B9BD5; font-weight: 600; color: white; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #D0D0D0; font-size: 8px; color: #666; }
  .footer-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .footer-balance { font-weight: 600; color: #1F4E79; }
  @media print { body { padding: 12px; } }
  @page { margin: 15mm 10mm; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <h1>${translations.statementTitle}</h1>
    <h2>${isletmeName}</h2>
    <div class="header-divider"></div>
    <div class="meta">
      <div class="meta-item"><span class="meta-label">${translations.entityLabel}:</span><span class="meta-value">${entityName}</span></div>
      ${phone ? `<div class="meta-item"><span class="meta-label">${translations.phone}:</span><span class="meta-value">${phone}</span></div>` : ''}
      <div class="meta-item"><span class="meta-label">${translations.date}:</span><span class="meta-value">${dateStr}</span></div>
      <div class="meta-item"><span class="meta-label">${translations.time}:</span><span class="meta-value">${timeStr}</span></div>
      <div class="meta-item"><span class="meta-label">${translations.period}:</span><span class="meta-value">${startFmt} - ${endFmt}</span></div>
      <div class="meta-item"><span class="meta-label">${translations.balance}:</span><span class="meta-value balance">${formatCurrency(data.closingBalance, entityCurrency)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${translations.dateColumn}</th>
        <th>${translations.typeColumn}</th>
        <th>${translations.descriptionColumn}</th>
        <th>${translations.debitColumn}</th>
        <th>${translations.creditColumn}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="summary-row">
        <td colspan="3">${translations.openingBalance}</td>
        <td class="amount">${openingDebit}</td>
        <td class="amount">${openingCredit}</td>
      </tr>
      ${transactionRows}
      <tr class="total-row">
        <td colspan="3">${translations.periodTotal}</td>
        <td class="amount">${fmt(data.totalDebit, entityCurrency)}</td>
        <td class="amount">${fmt(data.totalCredit, entityCurrency)}</td>
      </tr>
      <tr class="summary-row">
        <td colspan="3">${translations.closingBalance}</td>
        <td class="amount">${closingDebit}</td>
        <td class="amount">${closingCredit}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div class="footer-row">
      <span>${translations.totalRecords}: ${data.rows.length}</span>
      <span>${translations.debitColumn}: ${fmt(data.totalDebit, entityCurrency)} | ${translations.creditColumn}: ${fmt(data.totalCredit, entityCurrency)}</span>
    </div>
    <div class="footer-row">
      <span class="footer-balance">${translations.balance}: ${formatCurrency(data.closingBalance, entityCurrency)}</span>
    </div>
  </div>
</body>
</html>`;
}
