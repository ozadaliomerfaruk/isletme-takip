/**
 * Varlık Listesi PDF Export (cari + personel ana sayfa "anlık liste")
 * exportEntityListToExcel ile AYNI options şeklini alır; farkı çıktı PDF'dir.
 * expo-print ile HTML → PDF, ardından paylaşım (iOS paylaş sayfasında "Yazdır" da çıkar).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatCurrency } from './currency';
import { formatDateTime } from './date';
import type { EntityListExportOptions } from './excelExport';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function exportEntityListToPdf(options: EntityListExportOptions): Promise<void> {
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

  // Kolon genişlikleri → yüzde (Excel wch değerlerinden orantılı)
  const totalW = columns.reduce((s, c) => s + c.width, 0) || 1;
  const colGroup = columns
    .map((c) => `<col style="width:${((c.width / totalW) * 100).toFixed(1)}%" />`)
    .join('');

  const headerCells = columns
    .map((c) => `<th class="${c.align === 'right' ? 'right' : ''}">${escapeHtml(c.header)}</th>`)
    .join('');

  const bodyRows = rows
    .map((row) => {
      const tds = columns
        .map((col, c) => {
          const cell = row[c];
          if (cell && typeof cell === 'object') {
            const txt = cell.amount !== null && cell.amount !== undefined
              ? formatCurrency(cell.amount, cell.currency)
              : '';
            return `<td class="amount">${escapeHtml(txt)}</td>`;
          }
          return `<td class="${col.align === 'right' ? 'amount' : ''}">${escapeHtml((cell as string) ?? '')}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  // Özet (para birimi bazlı) — kolon sayısına yayılan etiket + sağda tutar
  const lastColSpan = Math.max(1, columns.length - 1);
  const summaryRows = summary && summary.length > 0
    ? summary
        .map((line) =>
          `<tr class="summary-row"><td colspan="${lastColSpan}">${escapeHtml(line.label)}</td>` +
          `<td class="amount">${escapeHtml(formatCurrency(line.amount, line.currency))}</td></tr>`
        )
        .join('')
    : '';

  const metaItems: string[] = [
    `<div class="meta-item"><span class="meta-label">${escapeHtml(labels.business)}:</span><span class="meta-value b">${escapeHtml(isletmeName)}</span></div>`,
    `<div class="meta-item"><span class="meta-label">${escapeHtml(labels.createdAt)}:</span><span class="meta-value">${escapeHtml(formatDateTime(new Date().toISOString()))}</span></div>`,
    `<div class="meta-item"><span class="meta-label">${escapeHtml(labels.recordCount)}:</span><span class="meta-value">${rows.length}</span></div>`,
  ];
  if (filterText) {
    metaItems.push(`<div class="meta-item"><span class="meta-label">${escapeHtml(labels.filter)}:</span><span class="meta-value">${escapeHtml(filterText)}</span></div>`);
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  /* Arka plan renklerini yazdırmaya zorla — yoksa mavi başlık zemini basılmaz ve
     beyaz başlık yazısı görünmez kalır (expo-print/WKWebView varsayılanı) */
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; padding: 24px; font-size: 12px; color: #333; }
  .header { margin-bottom: 12px; border-bottom: 3px solid #4472C4; padding-bottom: 12px; }
  .header h1 { color: #1F4E79; font-size: 20px; font-weight: 800; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 24px; }
  .meta-item { display: flex; gap: 4px; }
  .meta-label { font-weight: 700; color: #555; font-size: 12px; }
  .meta-value { color: #222; font-size: 12px; font-weight: 600; }
  .meta-value.b { font-weight: 800; color: #1F4E79; }
  .note { font-style: italic; color: #888; font-size: 11px; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
  thead th { background: #4472C4; color: #ffffff; padding: 8px 5px; font-size: 12px; font-weight: 800; text-align: left; border: 1px solid #3566A8; }
  thead th.right { text-align: right; }
  tbody td { border: 1px solid #D0D0D0; padding: 6px 5px; font-size: 11px; vertical-align: top; word-break: break-word; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .summary-row td { background: #E7E6E6; font-weight: 800; font-size: 11px; color: #1F4E79; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #D0D0D0; font-size: 11px; font-style: italic; color: #555; }
  @media print { body { padding: 12px; } }
  @page { margin: 15mm 10mm; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${metaItems.join('')}
    </div>
    <div class="note">${escapeHtml(labels.snapshotNote)}</div>
  </div>

  <table>
    <colgroup>${colGroup}</colgroup>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
      ${bodyRows}
      ${summaryRows}
    </tbody>
  </table>

  <div class="footer">${escapeHtml(labels.generatedByApp)}</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });

  // Anlamlı dosya adı ile paylaş (Print-<uuid>.pdf yerine)
  const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');
  let shareUri = uri;
  const namedUri = `${FileSystem.cacheDirectory}${safeName}.pdf`;
  try {
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    shareUri = namedUri;
  } catch {
    // kopyalama başarısızsa orijinal geçici dosyayla paylaş
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: shareDialogTitle,
      UTI: 'com.adobe.pdf',
    });
  } else {
    throw new Error(sharingNotSupported);
  }
}
