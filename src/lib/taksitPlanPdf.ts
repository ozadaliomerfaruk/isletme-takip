/**
 * Taksit Ödeme Planı PDF'i — müşteriye/tedarikçiye gönderilecek resmî görünümlü
 * plan dökümü. entityListPdf ile aynı altyapı: expo-print HTML → PDF → paylaş
 * (iOS paylaşım sayfasında "Yazdır" da çıkar).
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatCurrency } from './currency';
import { formatDateTime } from './date';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface TaksitPlanPdfSatir {
  sira: number;
  vadeTarihi: string; // GG.AA.YYYY biçiminde hazır
  tutar: number;
  odenen: number;
  kalan: number;
  /** 'odendi' | 'gecikmis' | 'acik' */
  durum: 'odendi' | 'gecikmis' | 'acik';
}

export interface TaksitPlanPdfOptions {
  isletmeName: string;
  cariName: string;
  currency: string;
  satirlar: TaksitPlanPdfSatir[];
  toplam: number;
  odenen: number;
  labels: {
    baslik: string;      // "Taksit Ödeme Planı"
    sira: string;        // "Taksit"
    vade: string;        // "Vade"
    tutar: string;       // "Tutar"
    odenen: string;      // "Ödenen"
    kalan: string;       // "Kalan"
    durum: string;       // "Durum"
    odendi: string;
    gecikmis: string;
    acik: string;
    genelToplam: string;
    toplamOdenen: string;
    toplamKalan: string;
    olusturulma: string; // "Oluşturulma"
  };
  fileName: string;            // uzantısız
  shareDialogTitle: string;
  sharingNotSupported: string;
}

export async function exportTaksitPlaniToPdf(options: TaksitPlanPdfOptions): Promise<void> {
  const { isletmeName, cariName, currency, satirlar, toplam, odenen, labels } = options;

  const kalanToplam = Math.max(0, Math.round((toplam - odenen) * 100) / 100);

  const durumHtml = (s: TaksitPlanPdfSatir) => {
    if (s.durum === 'odendi') return `<span class="badge ok">${escapeHtml(labels.odendi)}</span>`;
    if (s.durum === 'gecikmis') return `<span class="badge late">${escapeHtml(labels.gecikmis)}</span>`;
    return `<span class="badge open">${escapeHtml(labels.acik)}</span>`;
  };

  const bodyRows = satirlar
    .map(
      (s) => `
      <tr class="${s.durum === 'gecikmis' ? 'row-late' : ''}">
        <td>${s.sira}</td>
        <td>${escapeHtml(s.vadeTarihi)}</td>
        <td class="right">${escapeHtml(formatCurrency(s.tutar, currency))}</td>
        <td class="right">${escapeHtml(formatCurrency(s.odenen, currency))}</td>
        <td class="right strong">${escapeHtml(formatCurrency(s.kalan, currency))}</td>
        <td class="center">${durumHtml(s)}</td>
      </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1A1A1A; margin: 28px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0D5C4D; padding-bottom: 12px; margin-bottom: 16px; }
  .head h1 { margin: 0; font-size: 20px; color: #0D5C4D; }
  .head .isletme { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .head .meta { text-align: right; color: #6B7280; font-size: 11px; }
  .cari { font-size: 15px; font-weight: 700; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0D5C4D; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 11px; }
  th.right { text-align: right; } th.center { text-align: center; }
  td { padding: 8px 10px; border-bottom: 1px solid #E5E7EB; }
  td.right { text-align: right; } td.center { text-align: center; }
  td.strong { font-weight: 700; }
  tr.row-late td { background: #FEF2F2; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .badge.ok { background: #ECFDF5; color: #059669; }
  .badge.late { background: #FEE2E2; color: #DC2626; }
  .badge.open { background: #F3F4F6; color: #374151; }
  .totals { margin-top: 14px; width: 100%; display: flex; justify-content: flex-end; }
  .totals table { width: auto; min-width: 46%; }
  .totals td { border: none; padding: 4px 10px; font-size: 12px; }
  .totals td.lbl { color: #6B7280; }
  .totals td.val { text-align: right; font-weight: 700; }
  .totals tr.grand td { border-top: 2px solid #0D5C4D; padding-top: 8px; font-size: 14px; }
  .foot { margin-top: 26px; color: #9CA3AF; font-size: 10px; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div>
      <h1>${escapeHtml(labels.baslik)}</h1>
      <div class="isletme">${escapeHtml(isletmeName)}</div>
    </div>
    <div class="meta">${escapeHtml(labels.olusturulma)}: ${escapeHtml(formatDateTime(new Date()))}</div>
  </div>
  <p class="cari">${escapeHtml(cariName)}</p>
  <table>
    <thead><tr>
      <th>${escapeHtml(labels.sira)}</th>
      <th>${escapeHtml(labels.vade)}</th>
      <th class="right">${escapeHtml(labels.tutar)}</th>
      <th class="right">${escapeHtml(labels.odenen)}</th>
      <th class="right">${escapeHtml(labels.kalan)}</th>
      <th class="center">${escapeHtml(labels.durum)}</th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="totals"><table>
    <tr><td class="lbl">${escapeHtml(labels.genelToplam)}</td><td class="val">${escapeHtml(formatCurrency(toplam, currency))}</td></tr>
    <tr><td class="lbl">${escapeHtml(labels.toplamOdenen)}</td><td class="val">${escapeHtml(formatCurrency(odenen, currency))}</td></tr>
    <tr class="grand"><td class="lbl">${escapeHtml(labels.toplamKalan)}</td><td class="val">${escapeHtml(formatCurrency(kalanToplam, currency))}</td></tr>
  </table></div>
  <div class="foot">${escapeHtml(isletmeName)}</div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });

  // Paylaşımda okunur dosya adı (entityListPdf deseniyle aynı)
  let shareUri = uri;
  try {
    const target = `${FileSystem.cacheDirectory}${options.fileName}.pdf`;
    await FileSystem.copyAsync({ from: uri, to: target });
    shareUri = target;
  } catch {
    // kopya başarısızsa orijinal geçici dosyayla devam
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(options.sharingNotSupported);
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle: options.shareDialogTitle,
    UTI: 'com.adobe.pdf',
  });
}
