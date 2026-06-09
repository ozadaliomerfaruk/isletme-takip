// Gelir/Gider/Net karşılaştırma tablosu için PDF (HTML) üreteci.
// Saf fonksiyon: yan etkisi yok, tutarlar çağrı anında formatlanır (formatCurrency main
// para birimini uygular). Görsel stil mevcut pdfExport.ts ile uyumludur.

export interface ComparisonPdfRow {
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface ComparisonPdfData {
  /** Rapor başlığı (ör. "Karşılaştırma") */
  title: string;
  /** İşletme adı (alt başlık) */
  businessName: string;
  /** Kapsanan dönem aralığı etiketi (ör. "Haz 2025 - May 2026") */
  rangeLabel: string;
  /** "Oluşturma" gibi etiket + tarih değeri */
  generatedLabel: string;
  generatedValue: string;
  /** Sütun ve özet satırı etiketleri */
  labels: {
    period: string;
    income: string;
    expense: string;
    net: string;
    total: string;
    average: string;
  };
  /** Ekrandaki sırayla satırlar (en yeni dönem üstte) */
  rows: ComparisonPdfRow[];
  totals: { income: number; expense: number; net: number };
  averages: { income: number; expense: number; net: number };
  /** Tutar biçimlendirici (ana para birimi sembol/locale) */
  formatAmount: (value: number) => string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildComparisonPdfHtml(data: ComparisonPdfData): string {
  const { title, businessName, rangeLabel, generatedLabel, generatedValue, labels, rows, totals, averages, formatAmount } = data;

  const netClass = (value: number) => (value >= 0 ? 'pos' : 'neg');

  const bodyRows = rows
    .map(
      (row) => `
      <tr>
        <td class="period">${escapeHtml(row.label)}</td>
        <td class="amount pos">${escapeHtml(formatAmount(row.income))}</td>
        <td class="amount neg">${escapeHtml(formatAmount(row.expense))}</td>
        <td class="amount ${netClass(row.net)}">${escapeHtml(formatAmount(row.net))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; padding: 24px; font-size: 11px; color: #333; }
  .header { margin-bottom: 16px; border-bottom: 2px solid #4472C4; padding-bottom: 12px; }
  .header h1 { color: #1F4E79; font-size: 16px; margin-bottom: 4px; }
  .header h2 { color: #666; font-size: 12px; font-weight: normal; margin-bottom: 10px; }
  .header-divider { height: 1px; background: #D0D0D0; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 3px 24px; }
  .meta-item { display: flex; gap: 4px; }
  .meta-label { font-weight: 600; color: #666; }
  .meta-value { color: #333; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: #4472C4; color: white; padding: 8px; font-size: 11px; border: 1px solid #3566A8; }
  thead th.period { text-align: left; }
  thead th.amount { text-align: right; }
  tbody td { border: 1px solid #D0D0D0; padding: 7px 8px; font-size: 11px; }
  td.period { font-weight: 600; color: #1F4E79; white-space: nowrap; }
  td.amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.amount.pos { color: #15803d; }
  td.amount.neg { color: #dc2626; }
  tr.total-row td { background: #5B9BD5; font-weight: 700; color: white; }
  tr.total-row td.amount { color: white; }
  tr.average-row td { background: #E7E6E6; font-weight: 600; color: #1F4E79; }
  tr.average-row td.amount { color: #1F4E79; }
  @media print { body { padding: 12px; } }
  @page { margin: 15mm 10mm; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <h2>${escapeHtml(businessName)}</h2>
    <div class="header-divider"></div>
    <div class="meta">
      <div class="meta-item"><span class="meta-label">${escapeHtml(labels.period)}:</span><span class="meta-value">${escapeHtml(rangeLabel)}</span></div>
      <div class="meta-item"><span class="meta-label">${escapeHtml(generatedLabel)}:</span><span class="meta-value">${escapeHtml(generatedValue)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="period">${escapeHtml(labels.period)}</th>
        <th class="amount">${escapeHtml(labels.income)}</th>
        <th class="amount">${escapeHtml(labels.expense)}</th>
        <th class="amount">${escapeHtml(labels.net)}</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
      <tr class="total-row">
        <td class="period">${escapeHtml(labels.total)}</td>
        <td class="amount">${escapeHtml(formatAmount(totals.income))}</td>
        <td class="amount">${escapeHtml(formatAmount(totals.expense))}</td>
        <td class="amount">${escapeHtml(formatAmount(totals.net))}</td>
      </tr>
      <tr class="average-row">
        <td class="period">${escapeHtml(labels.average)}</td>
        <td class="amount">${escapeHtml(formatAmount(averages.income))}</td>
        <td class="amount">${escapeHtml(formatAmount(averages.expense))}</td>
        <td class="amount">${escapeHtml(formatAmount(averages.net))}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
}
