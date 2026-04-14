// Edge Function: Fatura Fotoğrafını Gemini Flash 2.0 ile Parse Et
// Base64 fotoğraf alır, Gemini Vision API ile yapılandırılmış JSON döndürür
// Architecture: Segmented prompts + deterministic server-side validation pipeline
// Security: JWT auth + per-user daily rate limiting (20/day)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry, measuredFetch } from "../_shared/telemetry.ts";

const DAILY_LIMIT = 20; // Kullanici basina gunluk fatura tarama limiti

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GeminiCandidate {
  content: {
    parts: Array<{ text?: string }>;
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message: string; code: number };
}

/** Structured response we expect from Gemini */
interface ParsedInvoiceResponse {
  documentType: string;
  supplierName: string | null;
  supplierTaxNumber: string | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  ettn: string | null;
  currency: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    vatRate: number | null;
    totalPrice: number;
    darali?: number | null;
    rawColumns?: number[];
    needsReview?: boolean;
  }>;
  detectedRowCount?: number;
  tableRowNames?: string[];
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
  supplierBalance: number | null;
  paymentInfo: {
    paymentMethod: string | null;
    cardLastFour: string | null;
    bankName: string | null;
  } | null;
  paidStatus: "paid" | "veresiye" | null;
  suggestedGiderCategory: string | null;
}

const VALID_DOCUMENT_TYPES = [
  "fatura",
  "irsaliye",
  "fis",
  "kasa_fisi",
  "pos_fisi",
  "siparis_fisi",
  "tahsilat_makbuzu",
  "odeme_dekontu",
  "not",
  "unknown",
];

/** Words that indicate summary/balance lines, NOT product items */
const BALANCE_KEYWORDS = [
  "eski bakiye", "onceki bakiye", "eski borc", "eski borç",
  "genel toplam", "g.toplam", "g. toplam", "son bakiye",
  "bakiye", "toplam", "ara toplam", "toplami", "toplamı",
  "yekun", "yekün", "son yekun", "son yekün",
  "fayita sozen", "fatura sözeri",
  // Hal faturası ek masraf satırları
  "rusum", "rüsum", "komisyon", "nakliye", "nakliye bedeli",
  "nakliye kdv", "iadesiz sandik", "iadesiz sandik bedeli",
  "iade sandik", "sandik bedeli", "mal kdv",
];

/** Column headers that Gemini might confuse with product names */
const COLUMN_HEADER_KEYWORDS = [
  "sandik cinsi", "sandık cinsi", "kap ad", "kap ad.",
  "cinsi", "kunye no", "künye no", "darali", "daralı",
  "dara", "safi", "fiyati", "fiyatı", "tutari", "tutarı",
  "miktar", "birim", "birim fiyat", "satir toplami",
];

// ═══════════════════════════════════════════════════════════════
// SEGMENTED PROMPTS
// ═══════════════════════════════════════════════════════════════

/** Segment 1: Base rules for ALL document types */
const BASE_PROMPT = `Sen bir Türk fatura/fiş/belge OCR asistanısın. Sana gönderilen belge fotoğrafını analiz edip yapılandırılmış JSON formatında döndüreceksin.

TEMEL KURALLAR:
1. Tüm sayıları Türk formatından (1.234,56) JavaScript number formatına (1234.56) çevir.
2. Tarihleri YYYY-MM-DD formatında döndür.
3. Birim tespiti: KG, GR, LT, ML, AD, ADET, PAKET, PKT, KUTU, KOLI, M, M2, M3, CM, TON, ÇİFT, TAKIM, PORSIYON, PARÇA. Birim bulamazsan null döndür.
4. KDV oranı sadece 0, 1, 10 veya 20 olabilir. Tespit edemezsen null döndür.
5. Para birimi: TRY, USD, EUR, GBP. Belirtilmemişse null döndür.
6. Ürün adlarını BÜYÜK HARF olarak, düzgün Türkçe karakterlerle yaz. OCR hatalarını düzelt.
7. Eğer fotoğraf hiç ürün içermiyorsa, boş items dizisi döndür.
8. supplierName: Tedarikçiyi (satıcıyı) bul, alıcıyı DEĞİL. Tam adını yaz.
9. supplierTaxNumber: Tedarikçinin VKN veya TCKN numarası (10-11 haneli). Alıcının VKN'sini YAZMA.
10. ETTN numarasını (varsa) ettn alanına yaz. UUID formatındadır.

KRİTİK DOĞRULAMA: quantity × unitPrice = totalPrice olmalı. Sağlanmıyorsa tekrar kontrol et.

ÜRÜN OLMAYAN SATIRLARI FİLTRELE:
- Bakiye, toplam, yekün, rusum, nakliye, komisyon gibi satırları items'a EKLEME.
- Sütun başlıklarını ürün olarak EKLEME.

TEDARİKÇİ BAKİYE: "Son Bakiye", "Cari Bakiye" varsa → supplierBalance. Yoksa null.

BELGE TİP TESPİTİ:
- "fatura": E-fatura, e-arşiv, hal faturası. ETTN veya "fatura" kelimesi + ürün satırları.
- "irsaliye": "İrsaliye" kelimesi, SADECE miktar, fiyat/KDV YOK veya 0.
- "kasa_fisi": Yazar kasa fişi, bilgi fişi.
- "fis": Genel fiş, tedarikçi belirsiz.
- "pos_fisi": POS fişi. SATIŞ, ONAY KODU, kart bilgisi. Ürün satırı YOK.
- "siparis_fisi": Sipariş fişi. KDV yoksa vatRate=0. Fiyat yoksa unitPrice=0.
- "tahsilat_makbuzu": Tahsilat/ödeme makbuzu.
- "odeme_dekontu": Banka havale/EFT dekontu.
- "not": Mali değeri olmayan belgeler.
- "unknown": Hiçbirine uymuyor.

İRSALİYE: Fiyat yoksa unitPrice=0, totalPrice=0, quantity'yi doldur.

ÇOK SAYFALI BELGE: Aynı ETTN = aynı fatura. FARKLI ETTN = FARKLI fatura.
SIRA NO aynı olan sayfalar AYNI faturaya aittir, ürünlerini BİRLEŞTİR.

DÖNDÜRÜLMÜŞ FOTOĞRAF: Metni doğru yönde oku.`;

/** Segment 2: Hal faturası specific rules */
const HAL_FATURA_PROMPT = `

═══ HAL FATURASI / KOMİSYONCU FATURASI KURALLARI ═══

Hal faturaları özel bir tablo formatına sahiptir:
| KÜNYE NO | CİNSİ | KAP AD. | DARALI | DARA | SAFİ | FİYATI | TUTARI |

HAL FATURASI İKİ AŞAMALI OKUMA (ZORUNLU):
⚠️ AŞAMA 1 — ÖNCE CİNSİ SÜTUNUNU TARA:
Tabloyu okumaya başlamadan önce, CİNSİ sütununu YUKARI'dan AŞAĞI'ya tara.
Her satırdaki ürün adını "tableRowNames" dizisine yaz. DAMGA ALTI DAHİL.
Örnek: tableRowNames: ["SOĞAN ARPACIK", "SARIMSAK", "KEREVİZ", "GÖBEK", "PANCAR", "FESLEĞEN", "HAVUÇ", "SALATALIK", "DOMATES"]

⚠️ AŞAMA 2 — HER İSİM İÇİN VERİLERİ OKU:
tableRowNames'teki HER isim için bir item oluştur. Hiçbir ismi ATLAMA.
tableRowNames.length === items.length === detectedRowCount olmalı.

HAL FATURASI İÇİN EK ÇIKTI ALANLARI (ÇOK ÖNEMLİ):
- Her ürün satırı için "rawColumns" alanına, satırdaki TÜM sayısal değerleri SOLDAN SAĞA sırayla bir dizi olarak yaz.
  ÖNEMLİ: SOLDAN SAĞA sıra KORUNMALIDIR. Sütun sırası her zaman şöyledir:
  [KÜNYE_NO, KAP_AD, DARALI, DARA, SAFİ, FİYATI, TUTARI]
  Örnek: Satırda "1234  MAYDANOZ  2  42  2  40  18  720" varsa → rawColumns: [1234, 2, 42, 2, 40, 18, 720]
  Bu örnekte: SAFİ=40 (sondan 3.), FİYATI=18 (sondan 2.), TUTARI=720 (son)
- rawColumns dizisini sayılar tam olarak fotoğrafta göründüğü gibi yaz, YORUM YAPMA, SIRALAMAYI DEĞİŞTİRME.
- "detectedRowCount": Tabloda tespit ettiğin toplam ürün satırı sayısını yaz (ek masraf satırları HARİÇ).
  Bu sayı items dizisinin uzunluğu ile EŞİT olmalı. Damga altındaki satırlar dahil.
- "tableRowNames": CİNSİ sütunundaki TÜM ürün adlarını sırasıyla yaz. DAMGA ALTI DAHİL.

SÜTUN OKUMA ALGORİTMASI:
- CİNSİ sütununu oku → ürün adı ("name")
- TUTARI sütununu oku → totalPrice
- FİYATI sütununu oku → unitPrice
- SAFİ sütununu oku → quantity
- DOĞRULAMA: quantity × unitPrice ≈ totalPrice olmalı
- unit = "KG" (hal faturası kg bazlıdır)

ÖRNEKLER (rawColumns son 3 elemanı her zaman [SAFİ, FİYATI, TUTARI] sırasındadır):
- MAYDANOZ: rawColumns=[1234, 2, 42, 2, 40, 18, 720] → SAFİ=40(kg), FİYATI=18(₺/kg), TUTARI=720(₺). quantity=40, unitPrice=18, totalPrice=720 (40×18=720 ✓)
- SALATALIK: rawColumns=[5678, 3, 25, 2, 23, 100, 2300] → SAFİ=23(kg), FİYATI=100(₺/kg), TUTARI=2300(₺). quantity=23, unitPrice=100, totalPrice=2300 (23×100=2300 ✓)
- DİKKAT: SAFİ her zaman rawColumns'un sondan 3. elemanıdır, FİYATI sondan 2., TUTARI son elemandır.

EK SÜTUN BİLGİLERİ:
- KAP AD. = Paket sayısı (MİKTAR DEĞİLDİR!)
- DARALI = Brüt ağırlık → "darali" alanına yaz (doğrulama için). quantity olarak KULLANMA!
- DARA = Ambalaj ağırlığı (kullanma!)
- SAFİ = DARALI - DARA

ADET BAZLI ÜRÜNLER: SAFİ=0 ve ADET değeri varsa, ADET'i miktar olarak kullan, unit="ADET".

ÜRÜN SATIRI ATLAMA YASAĞI (EN KRİTİK KURAL):
⚠️ Tablodaki TÜM ürün satırlarını oku, HİÇBİRİNİ ATLAMA!
⚠️ Bir satırı atlamak, yanlış veri üretmekten DAHA KÖTÜDÜR.

DAMGA/MÜHÜR/YAZMA ALTI:
- Fotoğraf üzerinde damga, mühür, elle yazılmış yazı veya gölge olsa bile ALTINDA KALAN SATIRLARI OKU.
- Damga genellikle tablonun alt-orta kısmında olur. Damganın altındaki veya üstündeki satırlar OKUNABİLİR.
- Damga YANINDA veya ÜSTÜNDE olan satırlarda kısmen okunabilen bilgiler bile yeterlidir.
- Bir ürün satırının sadece TUTARI okunabiliyorsa bile o satırı ekle.

OKUNAMAYAN SATIRLAR İÇİN PLACEHOLDER:
- Eğer bir satırı hiç okuyamıyorsan bile atlamak yerine placeholder ekle:
  → name = okunabilen kısmı yaz, hiç okunamıyorsa "OKUNAMAYAN_URUN"
  → quantity=0, unitPrice=0
  → totalPrice = okunabiliyorsa yaz, yoksa 0
  → rawColumns = okunabilen sayıları yaz
  → needsReview=true
- Tahmin yapma, hayali veri üretme. Ama ASLA satır ATLAMA.

DOĞRULAMA: detectedRowCount ile items dizisinin uzunluğu AYNI olmalı.
Eğer tabloda 7 satır saydıysan, items dizisinde de 7 öğe olmalı.

ÜRÜN ADI TEMİZLEME:
- OCR bozulmalarını düzelt: SOĞAN ARPACIK, SARIMSAK, KEREVİZ, GÖBEK, PANCAR, FESLEĞEN, HAVUÇ, SALATALIK, DOMATES, KİVİ, PORTAKAL, MUZ, ELMA, MAYDANOZ, ROKA, KABAK, PATLICAN, BİBER, MARUL, LİMON, MASKOLİN.
- Aynı ürün farklı yazımla varsa sadece birini doğru yazımla ekle.

REHİN FİŞİ BÖLÜMÜ (SAĞ TARAF): "SANDIK CİNSİ" tablosu ürün DEĞİLDİR, EKLEME.

HAL FATURASI TOPLAM HESAPLAMASI:
- YEKÜN → subtotal (sadece ürünlerin toplamı)
- MAL KDV → vatTotal
- SON YEKÜN → grandTotal (her şey dahil: YEKÜN + KDV + RUSUM + NAKLİYE vs.)
- Bu ek masrafları items'a EKLEME.
- subtotal ile grandTotal FARKLI olacaktır.

FATURA NUMARASI: "SIRA NO:" → invoiceNumber. "ISL.BEL.NO:" invoiceNumber DEĞİLDİR.

FATURA AYIRIMI: FARKLI ETTN veya FARKLI SIRA NO = FARKLI fatura.`;

/** Segment 3: Payment and category info (conditional) */
const PAYMENT_CATEGORY_PROMPT = `

═══ ÖDEME ve KATEGORİ BİLGİLERİ ═══

ÖDEME BİLGİSİ:
- POS/kart fişi: paymentMethod="kredi_karti", cardLastFour=son 4 hane, bankName
- "NAKİT": paymentMethod="nakit"
- Havale/EFT: paymentMethod="banka"
- Tespit edemezsen: paymentInfo=null

ÖDEME DURUMU:
- "VERESİYE", "BORÇ", "VADELİ", "Açık Hesap" → paidStatus="veresiye"
- POS fişi, "ÖDENDİ", nakit → paidStatus="paid"
- Belli değilse → paidStatus=null

GİDER KATEGORİ ÖNERİSİ:
- Temizlik malzemesi → "Temizlik"
- Züccaciye, mutfak eşyası → "Züccaciye"
- Market, bakkal, gıda → "Market/Gıda"
- Et, tavuk, balık → "Et/Tavuk"
- Sebze, meyve, hal faturası → "Sebze/Meyve"
- Süt ürünleri → "Süt Ürünleri"
- Ekmek, unlu mamül → "Fırın"
- Kırtasiye → "Kırtasiye"
- Tamir, bakım → "Bakım-Onarım"
- Kuru temizleme → "Kuru Temizleme"
- Tespit edemezsen → null`;

/** JSON schema block appended to all prompts */
const JSON_SCHEMA_SINGLE = `

SADECE aşağıdaki JSON yapısını döndür, başka hiçbir metin ekleme:
{
  "documentType": "fatura" | "irsaliye" | "kasa_fisi" | "fis" | "pos_fisi" | "siparis_fisi" | "tahsilat_makbuzu" | "odeme_dekontu" | "not" | "unknown",
  "supplierName": "string veya null",
  "supplierTaxNumber": "string veya null",
  "invoiceDate": "YYYY-MM-DD veya null",
  "invoiceNumber": "string veya null",
  "ettn": "string (UUID) veya null",
  "currency": "TRY" | "USD" | "EUR" | "GBP" | null,
  "items": [
    {
      "name": "ÜRÜN ADI",
      "quantity": 1,
      "unit": "KG" | "ADET" | ... | null,
      "unitPrice": 0.00,
      "vatRate": 0 | 1 | 10 | 20 | null,
      "totalPrice": 0.00,
      "darali": null,
      "rawColumns": [sayı1, sayı2, ...],
      "needsReview": false
    }
  ],
  "detectedRowCount": null,
  "tableRowNames": ["ÜRÜN1", "ÜRÜN2", "..."],
  "subtotal": null,
  "vatTotal": null,
  "grandTotal": null,
  "supplierBalance": null,
  "paymentInfo": { "paymentMethod": "nakit" | "kredi_karti" | "banka" | null, "cardLastFour": "string veya null", "bankName": "string veya null" } | null,
  "paidStatus": "paid" | "veresiye" | null,
  "suggestedGiderCategory": "string veya null"
}`;

const JSON_SCHEMA_BATCH = `

SADECE aşağıdaki JSON DİZİSİ yapısını döndür (array of invoices), başka hiçbir metin ekleme:
[
  {
    "documentType": "fatura",
    "supplierName": "string veya null",
    "supplierTaxNumber": "string veya null",
    "invoiceDate": "YYYY-MM-DD veya null",
    "invoiceNumber": "string veya null",
    "ettn": "string (UUID) veya null",
    "currency": "TRY" | "USD" | "EUR" | "GBP" | null,
    "items": [{ "name": "...", "quantity": 1, "unit": null, "unitPrice": 0, "vatRate": null, "totalPrice": 0, "darali": null, "rawColumns": [], "needsReview": false }],
    "detectedRowCount": null,
    "tableRowNames": [],
    "subtotal": null,
    "vatTotal": null,
    "grandTotal": null,
    "supplierBalance": null,
    "paymentInfo": null,
    "paidStatus": null,
    "suggestedGiderCategory": null
  }
]`;

/** Assemble the full system prompt for single image mode */
function buildSystemPrompt(): string {
  // Always include BASE + HAL_FATURA (hal detection happens inside Gemini)
  // PAYMENT_CATEGORY is always included for single mode since we don't know doc type yet
  return BASE_PROMPT + HAL_FATURA_PROMPT + PAYMENT_CATEGORY_PROMPT + JSON_SCHEMA_SINGLE;
}

/** Assemble the full system prompt for batch mode */
function buildBatchSystemPrompt(): string {
  const batchHeader = `Sen bir Türk fatura/fiş/belge OCR asistanısın. Sana birden fazla belge fotoğrafı gönderilecek.

GÖREVİN:
1. Tüm fotoğrafları incele.
2. Her fotoğraftaki ETTN ve SIRA NO (invoiceNumber) değerlerini dikkatlice oku.
3. YALNIZCA aynı ETTN veya aynı SIRA NO'ya sahip sayfaları birleştir.
4. Her BENZERSİZ fatura için AYRI bir JSON nesnesi döndür.
5. Sonuç olarak bir JSON DİZİSİ (array) döndür.

KRİTİK - FATURA AYIRMA KURALLARI:
- FARKLI ETTN = kesinlikle FARKLI fatura → ASLA birleştirme!
- FARKLI SIRA NO = kesinlikle FARKLI fatura → ASLA birleştirme!
- Aynı tedarikçi + aynı tarih BİRLEŞTİRME sebebi DEĞİLDİR.
- ISL.BEL.NO aynı olması birleştirme sebebi DEĞİLDİR.

AYNI FATURA TESPİTİ (SADECE bu durumda birleştir):
- Aynı ETTN → kesinlikle aynı fatura
- Aynı SIRA NO → kesinlikle aynı fatura

BİRLEŞTİRME KURALLARI:
- Aynı faturanın sayfalarındaki ürünleri TEK items dizisinde birleştir
- grandTotal, subtotal, vatTotal → son sayfadan al
- Aynı ürün farklı sayfalarda tekrar ediyorsa (aynı isim, aynı fiyat) → mükerrer ekleme

`;
  return batchHeader + BASE_PROMPT + HAL_FATURA_PROMPT + PAYMENT_CATEGORY_PROMPT + JSON_SCHEMA_BATCH;
}

// ═══════════════════════════════════════════════════════════════
// SANITIZATION PIPELINE
// ═══════════════════════════════════════════════════════════════

/** Helper: Normalize Turkish chars for comparison */
function normalizeTurkish(s: string): string {
  return s.toLowerCase()
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g");
}

/** Step 1: Sanitize basic fields — type coercion, null handling */
function sanitizeBasicFields(parsed: ParsedInvoiceResponse): ParsedInvoiceResponse {
  return {
    documentType: VALID_DOCUMENT_TYPES.includes(parsed.documentType)
      ? parsed.documentType
      : "unknown",
    supplierName: parsed.supplierName || null,
    supplierTaxNumber: parsed.supplierTaxNumber || null,
    invoiceDate: parsed.invoiceDate || null,
    invoiceNumber: parsed.invoiceNumber || null,
    ettn: parsed.ettn || null,
    currency: parsed.currency || null,
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
        name: String(item.name || "").trim(),
        quantity: typeof item.quantity === "number" ? item.quantity : 1,
        unit: item.unit || null,
        unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : 0,
        vatRate: [0, 1, 10, 20].includes(item.vatRate as number)
          ? item.vatRate
          : null,
        totalPrice: typeof item.totalPrice === "number"
          ? item.totalPrice
          : 0,
        darali: typeof (item as { darali?: number }).darali === "number"
          ? (item as { darali?: number }).darali
          : null,
        rawColumns: Array.isArray(item.rawColumns) ? item.rawColumns : undefined,
        needsReview: item.needsReview === true,
      }))
      : [],
    detectedRowCount: typeof parsed.detectedRowCount === "number" ? parsed.detectedRowCount : undefined,
    tableRowNames: Array.isArray(parsed.tableRowNames) ? parsed.tableRowNames.map(n => String(n || "").trim()).filter(n => n.length > 0) : undefined,
    subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
    vatTotal: typeof parsed.vatTotal === "number" ? parsed.vatTotal : null,
    grandTotal: typeof parsed.grandTotal === "number"
      ? parsed.grandTotal
      : null,
    supplierBalance: typeof parsed.supplierBalance === "number"
      ? parsed.supplierBalance
      : null,
    paymentInfo: parsed.paymentInfo
      ? {
        paymentMethod: ["nakit", "kredi_karti", "banka"].includes(
            parsed.paymentInfo.paymentMethod || "",
          )
          ? parsed.paymentInfo.paymentMethod
          : null,
        cardLastFour: parsed.paymentInfo.cardLastFour || null,
        bankName: parsed.paymentInfo.bankName || null,
      }
      : null,
    paidStatus: ["paid", "veresiye"].includes(parsed.paidStatus || "")
      ? parsed.paidStatus
      : null,
    suggestedGiderCategory: parsed.suggestedGiderCategory || null,
  };
}

/** Step 2: Filter out balance/summary lines and column headers */
function filterNonProductRows(result: ParsedInvoiceResponse): ParsedInvoiceResponse {
  // Log tableRowNames if present
  if (result.tableRowNames && result.tableRowNames.length > 0) {
    console.log(`[parse-invoice] TABLE ROW NAMES (${result.tableRowNames.length}): [${result.tableRowNames.join(", ")}]`);
  } else {
    console.log(`[parse-invoice] TABLE ROW NAMES: not provided by Gemini`);
  }

  // Log all items from Gemini BEFORE any filtering
  console.log(`[parse-invoice] RAW items from Gemini (${result.items.length}):`);
  for (const item of result.items) {
    const rc = item.rawColumns ? `rawCols=[${item.rawColumns.join(",")}]` : "no-rawCols";
    console.log(`[parse-invoice]   → "${item.name}" qty=${item.quantity} price=${item.unitPrice} total=${item.totalPrice} darali=${item.darali} ${rc} review=${item.needsReview}`);
  }

  result.items = result.items.filter((item) => {
    if (item.name.length === 0) return false;
    if (item.totalPrice <= 0 && item.quantity <= 0 && !item.needsReview) return false;

    const nameLower = normalizeTurkish(item.name);

    for (const keyword of BALANCE_KEYWORDS) {
      if (nameLower === keyword || nameLower.startsWith(keyword + " ")) {
        console.log(`[parse-invoice] Filtered balance line: "${item.name}"`);
        return false;
      }
    }

    for (const keyword of COLUMN_HEADER_KEYWORDS) {
      const kwNorm = normalizeTurkish(keyword);
      if (nameLower === kwNorm || nameLower.startsWith(kwNorm + " ")) {
        console.log(`[parse-invoice] Filtered column header: "${item.name}"`);
        return false;
      }
    }

    return true;
  });

  console.log(`[parse-invoice] After balance/header filter: ${result.items.length} items remain`);
  return result;
}

/** Step 3: De-duplicate items with very similar names */
function deduplicateItems(result: ParsedInvoiceResponse): ParsedInvoiceResponse {
  const deduped: typeof result.items = [];
  for (const item of result.items) {
    const nameNorm = normalizeTurkish(item.name).replace(/[^a-z0-9]/g, "");
    const existing = deduped.find((d) => {
      const dNorm = normalizeTurkish(d.name).replace(/[^a-z0-9]/g, "");
      return dNorm === nameNorm ||
        (dNorm.length > 3 && nameNorm.length > 3 &&
          (dNorm.includes(nameNorm) || nameNorm.includes(dNorm)));
    });
    if (existing && Math.abs(existing.totalPrice - item.totalPrice) < 1) {
      console.log(`[parse-invoice] De-duplicated: "${item.name}" (same as "${existing.name}")`);
      continue;
    }
    deduped.push(item);
  }
  result.items = deduped;
  console.log(`[parse-invoice] After dedup: ${result.items.length} items remain`);
  return result;
}

/**
 * Extract DARALI from rawColumns when item.darali is not provided by Gemini.
 * In hal faturası: rawColumns = [KÜNYE, KAP, DARALI, DARA, SAFİ, FİYATI, TUTARI]
 * DARALI is before the triplet and SAFİ ≈ DARALI (when DARA is small/0).
 * We find it by looking for a number in the prefix that approximately matches
 * one of the first two numbers in the last 3 (one of which should be SAFİ).
 */
function extractDaraliFromRawColumns(raw: number[]): number | null {
  if (raw.length < 5) return null;

  const lastThree = raw.slice(-3); // [candidate_safi, candidate_fiyati, candidate_tutari]
  const prefix = raw.slice(0, -3); // everything before the triplet

  // Search from the end of prefix (closest to the triplet) backwards
  for (let i = prefix.length - 1; i >= 0; i--) {
    const val = prefix[i];
    if (val <= 0 || val > 500) continue; // must be a reasonable weight

    // Check if val ≈ one of the two non-TUTARI candidates (within 20% for DARA tolerance)
    for (let c = 0; c < 2; c++) {
      const candidate = lastThree[c];
      if (candidate <= 0) continue;
      const diff = Math.abs(val - candidate) / Math.max(val, candidate, 1);
      if (diff < 0.20) { // within 20% → DARA up to 20% of DARALI
        return val;
      }
    }
  }

  return null;
}

/** Step 4: Resolve hal fatura columns from rawColumns using combinatorial math */
function resolveHalColumnsFromRaw(result: ParsedInvoiceResponse, isHal: boolean): ParsedInvoiceResponse {
  if (!isHal) return result;

  let resolvedCount = 0;

  for (const item of result.items) {
    if (item.needsReview) continue; // placeholder, skip
    const raw = item.rawColumns;
    if (!raw || raw.length < 3) {
      console.log(`[parse-invoice] HAL RAW-SKIP: "${item.name}" (no rawColumns or < 3 numbers)`);
      continue;
    }

    // Use item.darali if provided, otherwise extract from rawColumns
    let darali = item.darali;
    if (!darali || darali <= 0) {
      darali = extractDaraliFromRawColumns(raw);
      if (darali) {
        item.darali = darali; // store for validateHalWithDarali fallback
        console.log(`[parse-invoice] HAL DARALI EXTRACTED: "${item.name}" darali=${darali} from rawColumns=[${raw.join(",")}]`);
      }
    }

    // Try to find the triplet (SAFİ, FİYATI, TUTARI) where SAFİ × FİYATI ≈ TUTARI
    // Search from the last 3 elements first, then expand to last 4
    let resolved = findProductTriplet(raw, darali);

    // If darali constraint rejected all candidates, darali might be wrong
    // (Gemini sometimes confuses DARA with DARALI). Retry without darali.
    if (!resolved && darali && darali > 0) {
      const resolvedNoDarali = findProductTriplet(raw, null);
      if (resolvedNoDarali) {
        console.log(`[parse-invoice] HAL DARALI WRONG: "${item.name}" darali=${darali} rejected all triplets, retrying without darali → safi=${resolvedNoDarali.safi}, fiyati=${resolvedNoDarali.fiyati}`);
        resolved = resolvedNoDarali;
        item.darali = 0; // Clear wrong darali so validateHalWithDarali won't use it
      }
    }

    if (resolved) {
      const oldQty = item.quantity;
      const oldPrice = item.unitPrice;
      const oldTotal = item.totalPrice;

      item.quantity = resolved.safi;
      item.unitPrice = resolved.fiyati;
      item.totalPrice = resolved.tutari;

      if (oldQty !== item.quantity || oldPrice !== item.unitPrice || oldTotal !== item.totalPrice) {
        console.log(`[parse-invoice] HAL RESOLVED: "${item.name}" qty ${oldQty}→${item.quantity}, price ${oldPrice}→${item.unitPrice}, total ${oldTotal}→${item.totalPrice}`);
      } else {
        console.log(`[parse-invoice] HAL CONFIRMED: "${item.name}" qty=${item.quantity}, price=${item.unitPrice}, total=${item.totalPrice}`);
      }
      resolvedCount++;
    } else {
      console.log(`[parse-invoice] HAL RAW-FAIL: "${item.name}" rawColumns=[${raw.join(",")}] — no valid triplet found, keeping Gemini values`);
    }
  }

  if (resolvedCount > 0) {
    console.log(`[parse-invoice] HAL RAW RESOLVE: ${resolvedCount}/${result.items.length} items resolved from rawColumns`);
  }

  return result;
}

/**
 * Find the best (SAFİ, FİYATI, TUTARI) triplet from rawColumns where SAFİ × FİYATI ≈ TUTARI.
 *
 * CRITICAL: Multiplication is commutative (a×b = b×a), so math alone can't distinguish
 * SAFİ from FİYATI. We MUST use positional ordering from rawColumns:
 * Hal faturası columns are always: [..., SAFİ, FİYATI, TUTARI]
 * So the number appearing EARLIER (leftward) in rawColumns = SAFİ,
 * and the one appearing LATER (rightward) = FİYATI.
 */
function findProductTriplet(
  raw: number[],
  darali: number | null | undefined,
): { safi: number; fiyati: number; tutari: number } | null {
  // Work with original indices to preserve positional information
  // Try last 3, then last 4 numbers from rawColumns
  const windowSizes = [3, 4];

  let bestMatch: {
    safi: number;
    fiyati: number;
    tutari: number;
    safiIdx: number;   // original index in raw[]
    fiyatiIdx: number; // original index in raw[]
    tutariIdx: number; // original index in raw[]
    error: number;
  } | null = null;

  for (const windowSize of windowSizes) {
    if (raw.length < windowSize) continue;

    const startIdx = raw.length - windowSize;

    // Try all permutations of 3 numbers from the window
    for (let i = startIdx; i < raw.length; i++) {
      for (let j = startIdx; j < raw.length; j++) {
        if (j === i) continue;
        for (let k = startIdx; k < raw.length; k++) {
          if (k === i || k === j) continue;

          const a = raw[i]; // potential SAFİ
          const b = raw[j]; // potential FİYATI
          const c = raw[k]; // potential TUTARI

          if (a <= 0 || b <= 0 || c <= 0) continue;

          const product = a * b;
          const error = Math.abs(product - c) / Math.max(c, 1);

          // Tolerance: 2% (handles rounding in Turkish number formatting)
          if (error > 0.02) continue;

          // DARALI cross-check: SAFİ should be ≤ DARALI
          if (darali && darali > 0 && a > darali * 1.05) continue;

          // POSITIONAL SCORING (lower = better):
          let penalty = error;

          // Rule 1: TUTARI should be the RIGHTMOST (last index) — strong signal
          if (k !== raw.length - 1) {
            penalty += 0.1;
          }

          // Rule 2: SAFİ should come BEFORE FİYATI in column order
          // In hal faturası: [..., SAFİ, FİYATI, TUTARI]
          // So safi_index < fiyati_index < tutari_index
          if (i >= j) {
            // SAFİ is at same or later position than FİYATI — wrong order!
            penalty += 0.05;
          }

          // Rule 3: Prefer SAFİ at index -3 and FİYATI at index -2 (ideal positions)
          const idealSafiIdx = raw.length - 3;
          const idealFiyatiIdx = raw.length - 2;
          if (i === idealSafiIdx && j === idealFiyatiIdx) {
            penalty -= 0.001; // bonus for perfect positioning
          }

          if (!bestMatch || penalty < bestMatch.error) {
            bestMatch = {
              safi: a,
              fiyati: b,
              tutari: c,
              safiIdx: i,
              fiyatiIdx: j,
              tutariIdx: k,
              error: penalty,
            };
          }
        }
      }
    }
  }

  if (bestMatch) {
    console.log(`[parse-invoice] TRIPLET FOUND: safi=${bestMatch.safi}(idx${bestMatch.safiIdx}) × fiyati=${bestMatch.fiyati}(idx${bestMatch.fiyatiIdx}) = tutari=${bestMatch.tutari}(idx${bestMatch.tutariIdx}) | raw=[${raw.join(",")}]`);
  }

  return bestMatch ? { safi: bestMatch.safi, fiyati: bestMatch.fiyati, tutari: bestMatch.tutari } : null;
}

/** Step 5: Validate hal fatura with DARALI-based swap detection (runs on ALL items including rawColumns-resolved) */
function validateHalWithDarali(result: ParsedInvoiceResponse, isHal: boolean): ParsedInvoiceResponse {
  if (!isHal) return result;

  let swapCount = 0;
  let totalKg = 0;

  for (const item of result.items) {
    if (item.needsReview) continue;
    if (item.unit?.toUpperCase() !== "KG" || item.totalPrice <= 0) continue;
    if (item.quantity <= 0 || item.unitPrice <= 0) continue;
    // NOTE: We do NOT skip rawColumns items anymore.
    // Gemini may put swapped values in rawColumns too, so darali cross-check is essential.
    totalKg++;

    const darali = item.darali;

    if (darali && darali > 0) {
      // Sanity check: darali must be >= SAFİ. If darali < both candidates, it's wrong
      // (Gemini confused DARA with DARALI). Skip darali-based validation.
      if (darali < item.quantity && darali < item.unitPrice) {
        console.log(`[parse-invoice] HAL DARALI INVALID: "${item.name}" darali=${darali} < both qty=${item.quantity} and price=${item.unitPrice}, skipping darali check`);
      } else if (item.quantity > darali * 1.01 && item.unitPrice <= darali * 1.01) {
        const origQty = item.quantity;
        const origPrice = item.unitPrice;
        item.quantity = origPrice;
        item.unitPrice = origQty;
        swapCount++;
        console.log(`[parse-invoice] HAL SWAP FIX (darali=${darali}): "${item.name}" qty ${origQty}→${item.quantity}, price ${origPrice}→${item.unitPrice}`);
      } else if (item.unitPrice > darali * 1.01 && item.quantity <= darali * 1.01) {
        console.log(`[parse-invoice] HAL OK (darali=${darali}): "${item.name}" qty=${item.quantity}, price=${item.unitPrice}`);
      } else {
        const calcQty = Math.round((item.totalPrice / item.unitPrice) * 100) / 100;
        const qtyMatchesDarali = Math.abs(calcQty - darali) / darali < 0.05;
        if (!qtyMatchesDarali) {
          const calcQtySwap = Math.round((item.totalPrice / item.quantity) * 100) / 100;
          const swapMatchesDarali = Math.abs(calcQtySwap - darali) / darali < 0.05;
          if (swapMatchesDarali) {
            const origQty = item.quantity;
            const origPrice = item.unitPrice;
            item.quantity = origPrice;
            item.unitPrice = origQty;
            swapCount++;
            console.log(`[parse-invoice] HAL SWAP FIX (darali match): "${item.name}" qty ${origQty}→${item.quantity}, price ${origPrice}→${item.unitPrice}`);
          } else {
            console.log(`[parse-invoice] HAL AMBIGUOUS (darali=${darali}): "${item.name}" qty=${item.quantity}, price=${item.unitPrice}`);
          }
        } else {
          console.log(`[parse-invoice] HAL OK (darali=${darali}): "${item.name}" qty=${item.quantity}≈darali, price=${item.unitPrice}`);
        }
      }
    } else {
      console.log(`[parse-invoice] HAL NO-DARALI: "${item.name}" qty=${item.quantity}, price=${item.unitPrice}, total=${item.totalPrice}`);
    }
  }

  if (swapCount > 0) {
    console.log(`[parse-invoice] HAL DARALI SWAP SUMMARY: Fixed ${swapCount}/${totalKg} KG items`);
  }

  return result;
}

/** Step 6: Validate quantity × unitPrice ≈ totalPrice for ALL document types */
function validateItemMath(result: ParsedInvoiceResponse): ParsedInvoiceResponse {
  for (const item of result.items) {
    if (item.needsReview) continue;

    if (item.quantity > 0 && item.unitPrice > 0 && item.totalPrice > 0) {
      const expected = item.quantity * item.unitPrice;
      const diff = Math.abs(expected - item.totalPrice);
      const tolerance = item.totalPrice * 0.05;
      if (diff > tolerance && diff > 1) {
        console.log(
          `[parse-invoice] Price mismatch: "${item.name}" qty=${item.quantity} × price=${item.unitPrice} = ${expected} ≠ ${item.totalPrice}`,
        );
        if (item.totalPrice > item.unitPrice) {
          item.unitPrice = Math.round((item.totalPrice / item.quantity) * 100) / 100;
          console.log(`[parse-invoice] Recalculated unitPrice: ${item.unitPrice}`);
        }
      }
    }
    if (item.unitPrice === 0 && item.totalPrice > 0 && item.quantity > 0) {
      item.unitPrice = Math.round((item.totalPrice / item.quantity) * 100) / 100;
    }
  }

  return result;
}

/** Step 7: Recover missing rows from tableRowNames and detect missing rows via subtotal */
function recoverAndDetectMissingRows(
  result: ParsedInvoiceResponse,
  isHal: boolean,
): { result: ParsedInvoiceResponse; missingRowWarning: Record<string, unknown> | null } {
  if (!isHal) return { result, missingRowWarning: null };

  let warning: Record<string, unknown> | null = null;

  // Check 0: tableRowNames vs items — recover missing rows by name
  if (result.tableRowNames && result.tableRowNames.length > result.items.length) {
    const itemNames = new Set(result.items.map(i => normalizeTurkish(i.name).replace(/[^a-z0-9]/g, "")));
    const missingNames: string[] = [];

    for (const rowName of result.tableRowNames) {
      const nameNorm = normalizeTurkish(rowName).replace(/[^a-z0-9]/g, "");
      // Check if any existing item matches this name (exact or substring)
      const found = [...itemNames].some(existing =>
        existing === nameNorm ||
        (existing.length > 3 && nameNorm.length > 3 && (existing.includes(nameNorm) || nameNorm.includes(existing)))
      );
      if (!found) {
        missingNames.push(rowName);
      }
    }

    if (missingNames.length > 0) {
      console.log(`[parse-invoice] TABLE ROW RECOVERY: Found ${missingNames.length} names in tableRowNames not in items: [${missingNames.join(", ")}]`);
      // Add placeholder items for missing names
      for (const name of missingNames) {
        result.items.push({
          name: name.toUpperCase(),
          quantity: 0,
          unit: "KG",
          unitPrice: 0,
          vatRate: null,
          totalPrice: 0,
          needsReview: true,
        });
        console.log(`[parse-invoice] ADDED PLACEHOLDER: "${name}" (needsReview=true, from tableRowNames)`);
      }
      warning = {
        type: "tableRowNames",
        recoveredNames: missingNames,
        totalExpected: result.tableRowNames.length,
        totalParsed: result.items.length - missingNames.length,
      };
    }
  }

  // Check 1: detectedRowCount vs actual items
  if (result.detectedRowCount && result.detectedRowCount > result.items.length) {
    const missing = result.detectedRowCount - result.items.length;
    console.log(`[parse-invoice] ROW COUNT MISMATCH: Gemini detected ${result.detectedRowCount} rows but only ${result.items.length} items parsed. Missing ~${missing} rows.`);
    warning = {
      ...(warning || {}),
      type: warning ? "both" : "rowCount",
      detected: result.detectedRowCount,
      parsed: result.items.length,
      missing,
    };
  }

  // Check 2: subtotal cross-check — if still missing amount, add a catch-all placeholder
  if (result.subtotal && result.subtotal > 0) {
    const itemsSum = result.items
      .filter(i => !i.needsReview)
      .reduce((s, i) => s + i.totalPrice, 0);
    const missingAmount = result.subtotal - itemsSum;

    if (missingAmount > result.subtotal * 0.03 && missingAmount > 10) { // More than 3% and >10₺
      console.log(`[parse-invoice] HAL SUBTOTAL MISMATCH: items total=${itemsSum}, YEKUN=${result.subtotal}, missing amount=${missingAmount} (${((missingAmount / result.subtotal) * 100).toFixed(1)}%)`);

      // Check if we already have needsReview placeholders with totalPrice=0 that could absorb this
      const unresolvedPlaceholders = result.items.filter(i => i.needsReview && i.totalPrice === 0);
      if (unresolvedPlaceholders.length === 1) {
        // Only one unknown placeholder — assign the missing amount to it
        unresolvedPlaceholders[0].totalPrice = Math.round(missingAmount * 100) / 100;
        console.log(`[parse-invoice] ASSIGNED MISSING AMOUNT: ₺${missingAmount.toFixed(2)} to placeholder "${unresolvedPlaceholders[0].name}"`);
      } else if (unresolvedPlaceholders.length === 0) {
        // No placeholders — add a new catch-all
        result.items.push({
          name: "EKSİK_SATIR",
          quantity: 0,
          unit: "KG",
          unitPrice: 0,
          vatRate: null,
          totalPrice: Math.round(missingAmount * 100) / 100,
          needsReview: true,
        });
        console.log(`[parse-invoice] ADDED CATCH-ALL PLACEHOLDER: "EKSİK_SATIR" totalPrice=₺${missingAmount.toFixed(2)}`);
      }

      warning = {
        ...(warning || {}),
        type: warning ? "both" : "subtotal",
        itemsTotal: itemsSum,
        subtotal: result.subtotal,
        missingAmount,
        percentMissing: ((missingAmount / result.subtotal) * 100).toFixed(1),
      };
    }
  }

  return { result, missingRowWarning: warning };
}

/** Step 8: Clean up internal fields from the response (darali, rawColumns) */
function cleanupInternalFields(result: ParsedInvoiceResponse): ParsedInvoiceResponse {
  for (const item of result.items) {
    delete (item as Record<string, unknown>).darali;
    delete (item as Record<string, unknown>).rawColumns;
    // Keep needsReview if true, otherwise remove
    if (!item.needsReview) {
      delete (item as Record<string, unknown>).needsReview;
    }
  }
  // Clean internal fields from response
  delete (result as Record<string, unknown>).detectedRowCount;
  delete (result as Record<string, unknown>).tableRowNames;
  return result;
}

/** Detect if this is a hal faturası based on content */
function detectHalFatura(result: ParsedInvoiceResponse): boolean {
  if (result.documentType !== "fatura" || result.items.length === 0) return false;
  const kgCount = result.items.filter((i) => i.unit?.toUpperCase() === "KG").length;
  // Also check if rawColumns are present (strong hal fatura signal)
  const hasRawColumns = result.items.some(i => i.rawColumns && i.rawColumns.length >= 3);
  return kgCount >= result.items.length * 0.5 || hasRawColumns;
}

/** Main sanitization pipeline */
function sanitizeInvoice(parsed: ParsedInvoiceResponse): {
  sanitized: ParsedInvoiceResponse;
  missingRowWarning: Record<string, unknown> | null;
  preCleanupItems: Array<{ darali?: number | null; rawColumns?: number[] }>;
} {
  let result = sanitizeBasicFields(parsed);
  result = filterNonProductRows(result);
  result = deduplicateItems(result);

  const isHal = detectHalFatura(result);
  if (isHal) {
    console.log(`[parse-invoice] HAL FATURA detected: ${result.items.length} items, running hal pipeline`);
  }

  result = resolveHalColumnsFromRaw(result, isHal);
  result = validateHalWithDarali(result, isHal);
  result = validateItemMath(result);

  const { result: validatedResult, missingRowWarning } = recoverAndDetectMissingRows(result, isHal);
  result = validatedResult;

  // Capture pre-cleanup data for debugging (darali, rawColumns)
  const preCleanupItems = result.items.map(i => ({
    darali: i.darali,
    rawColumns: i.rawColumns ? [...i.rawColumns] : undefined,
  }));

  result = cleanupInternalFields(result);

  return { sanitized: result, missingRowWarning, preCleanupItems };
}

// ═══════════════════════════════════════════════════════════════
// GEMINI API
// ═══════════════════════════════════════════════════════════════

/** Call Gemini API with retry for 429 rate limit errors */
async function callGemini(apiKey: string, parts: Array<Record<string, unknown>>): Promise<string> {
  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const requestBody = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = attempt * 2000; // 2s, 4s
      console.log(`[parse-invoice] Retry ${attempt}/${MAX_RETRIES} after ${delayMs}ms delay...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const geminiResponse = await measuredFetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }, "parse-invoice", true);

    if (geminiResponse.status === 429) {
      const errorText = await geminiResponse.text();
      console.warn(`[parse-invoice] Gemini 429 rate limit (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`, errorText);
      lastError = new Error(`Gemini API rate limit (429)`);
      continue;
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[parse-invoice] Gemini API error:", errorText);
      throw new Error(
        `Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`,
      );
    }

    const geminiData: GeminiResponse = await geminiResponse.json();

    if (geminiData.error) {
      throw new Error(`Gemini error: ${geminiData.error.message}`);
    }

    const textContent =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      throw new Error("No response from Gemini");
    }

    return textContent;
  }

  throw lastError || new Error("Gemini API rate limit exceeded after retries");
}

// ═══════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(withFnTelemetry({ name: "parse-invoice", largePayloadProne: true }, async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ===== AUTH: JWT'den kullanici kimligini dogrula =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Yetkilendirme gerekli" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Gecersiz oturum" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    // Body'yi once oku - fotograf sayisini bilmemiz lazim
    const body = await req.json() as {
      image?: string;
      mimeType?: string;
      images?: Array<{ image: string; mimeType?: string }>;
    };

    // Fotograf sayisini belirle (batch modda N, tekli modda 1)
    const imageCount = (body.images && Array.isArray(body.images)) ? body.images.length : 1;

    // ===== RATE LIMIT: Kullanici basina gunluk limit (fotograf bazli) =====
    const { data: remaining } = await supabaseAdmin.rpc("get_remaining_usage", {
      p_user_id: user.id,
      p_function_name: "parse-invoice",
      p_daily_limit: DAILY_LIMIT,
    });

    const remainingCount = remaining ?? DAILY_LIMIT;

    if (remainingCount <= 0) {
      console.warn(`[parse-invoice] Rate limit exceeded for user ${user.id}. Remaining: 0`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Günlük fatura tarama limitine ulaştınız (${DAILY_LIMIT}/gün). Yarın tekrar deneyin.`,
          rateLimited: true,
          dailyLimit: DAILY_LIMIT,
          remaining: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 },
      );
    }

    if (imageCount > remainingCount) {
      console.warn(`[parse-invoice] Not enough quota for user ${user.id}. Requested: ${imageCount}, Remaining: ${remainingCount}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Günlük ${remainingCount} fatura tarama hakkınız kaldı, ${imageCount} fotoğraf gönderdiniz. Daha az fotoğraf ile deneyin.`,
          rateLimited: true,
          dailyLimit: DAILY_LIMIT,
          remaining: remainingCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 },
      );
    }

    // Her fotograf icin birer kullanim kaydi ekle
    for (let i = 0; i < imageCount; i++) {
      await supabaseAdmin.rpc("record_api_usage", {
        p_user_id: user.id,
        p_function_name: "parse-invoice",
      });
    }

    console.log(`[parse-invoice] User ${user.id} - ${imageCount} image(s) recorded, ${remainingCount - imageCount} remaining`);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    // ===== MULTI-IMAGE BATCH MODE =====
    if (body.images && Array.isArray(body.images) && body.images.length > 0) {
      console.log(`[parse-invoice] BATCH MODE: Processing ${body.images.length} images in single Gemini call`);

      const systemPrompt = buildBatchSystemPrompt();

      // Build parts array: system prompt + all images + user prompt
      const parts: Array<Record<string, unknown>> = [
        { text: systemPrompt },
      ];

      for (let i = 0; i < body.images.length; i++) {
        const img = body.images[i];
        const base64Data = img.image.replace(/^data:image\/\w+;base64,/, "");
        const imageMime = img.mimeType || "image/jpeg";
        parts.push({
          inlineData: {
            mimeType: imageMime,
            data: base64Data,
          },
        });
        console.log(`[parse-invoice] Image ${i + 1}/${body.images.length}: ${Math.round(base64Data.length / 1024)}KB`);
      }

      parts.push({
        text: `Bu ${body.images.length} fotoğrafı analiz et. Her fotoğraftaki ETTN ve SIRA NO değerlerini dikkatlice oku. SADECE aynı ETTN veya aynı SIRA NO olan sayfaları birleştir. Farklı ETTN veya farklı SIRA NO olan fotoğraflar FARKLI faturalardır. Sonucu JSON DİZİSİ olarak döndür.`,
      });

      const textContent = await callGemini(apiKey, parts);

      // Log raw Gemini response for debugging
      console.log(`[parse-invoice] RAW Gemini batch response (first 2000 chars):`, textContent.substring(0, 2000));

      // Parse as array
      let parsedArray: ParsedInvoiceResponse[];
      try {
        const rawParsed = JSON.parse(textContent);
        parsedArray = Array.isArray(rawParsed) ? rawParsed : [rawParsed];
      } catch {
        console.error("[parse-invoice] Failed to parse Gemini batch JSON:", textContent);
        throw new Error("Gemini returned invalid JSON");
      }

      console.log(`[parse-invoice] Gemini returned ${parsedArray.length} invoice(s) from ${body.images.length} images`);

      // Log each raw parsed invoice's key identifiers BEFORE sanitization
      for (let idx = 0; idx < parsedArray.length; idx++) {
        const p = parsedArray[idx];
        console.log(`[parse-invoice] Raw invoice[${idx}]: ettn="${p.ettn}" invNo="${p.invoiceNumber}" supplier="${p.supplierName}" date="${p.invoiceDate}" items=${p.items?.length || 0} grandTotal=${p.grandTotal} detectedRows=${p.detectedRowCount}`);
      }

      // Sanitize each invoice through the pipeline
      const results: ParsedInvoiceResponse[] = [];
      const warnings: Array<Record<string, unknown> | null> = [];
      for (const parsed of parsedArray) {
        const { sanitized, missingRowWarning } = sanitizeInvoice(parsed);
        results.push(sanitized);
        warnings.push(missingRowWarning);
      }

      // Build debug info for client
      const debugInfo = results.map((r, idx) => ({
        index: idx,
        ettn: r.ettn,
        invoiceNumber: r.invoiceNumber,
        supplierName: r.supplierName,
        date: r.invoiceDate,
        itemCount: r.items.length,
        grandTotal: r.grandTotal,
        missingRowWarning: warnings[idx] || undefined,
      }));

      for (const r of results) {
        console.log(
          `[parse-invoice] Batch result: ${r.items.length} items, type: ${r.documentType}, supplier: ${r.supplierName}, invNo: ${r.invoiceNumber}, ettn: ${r.ettn}`,
        );
      }

      console.log(`[parse-invoice] BATCH RESULT: ${body.images.length} images → ${results.length} invoices`);

      return new Response(
        JSON.stringify({ success: true, data: results, batch: true, debug: debugInfo }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ===== SINGLE IMAGE MODE (backward compatible) =====
    const image = body.image;
    if (!image) {
      return new Response(
        JSON.stringify({ error: "image (base64) or images array is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageMime = body.mimeType || "image/jpeg";

    console.log(
      `[parse-invoice] SINGLE MODE: Processing image (${Math.round(base64Data.length / 1024)}KB)`,
    );

    const systemPrompt = buildSystemPrompt();

    const parts: Array<Record<string, unknown>> = [
      { text: systemPrompt },
      {
        inlineData: {
          mimeType: imageMime,
          data: base64Data,
        },
      },
      {
        text: "Bu belge fotoğrafını analiz et ve JSON olarak döndür.",
      },
    ];

    const textContent = await callGemini(apiKey, parts);

    // Log raw Gemini response for debugging (single mode)
    console.log(`[parse-invoice] RAW Gemini single response (first 2000 chars):`, textContent.substring(0, 2000));

    let parsed: ParsedInvoiceResponse;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      console.error("[parse-invoice] Failed to parse Gemini JSON:", textContent);
      throw new Error("Gemini returned invalid JSON");
    }

    // Log detectedRowCount, rawColumns, and tableRowNames before sanitization
    const rawColCount = parsed.items?.filter(i => i.rawColumns && i.rawColumns.length > 0).length || 0;
    const tableNames = parsed.tableRowNames || [];
    const daraliCount = parsed.items?.filter(i => i.darali && i.darali > 0).length || 0;
    console.log(`[parse-invoice] Pre-sanitize: ${parsed.items?.length || 0} items, ${rawColCount} with rawColumns, ${daraliCount} with darali, detectedRowCount=${parsed.detectedRowCount}, tableRowNames=[${tableNames.join(",")}], docType=${parsed.documentType}`);

    const { sanitized, missingRowWarning, preCleanupItems } = sanitizeInvoice(parsed);

    console.log(
      `[parse-invoice] Parsed ${sanitized.items.length} items, type: ${sanitized.documentType}, supplier: ${sanitized.supplierName}`,
    );

    // Include debug info in single mode response for client-side debugging
    const _debug = {
      rawItemCount: parsed.items?.length || 0,
      rawColumnsCount: rawColCount,
      daraliFromGemini: daraliCount,
      detectedRowCount: parsed.detectedRowCount || null,
      tableRowNames: tableNames.length > 0 ? tableNames : null,
      finalItemCount: sanitized.items.length,
      missingRowWarning: missingRowWarning || undefined,
      itemSummary: sanitized.items.map((item, idx) => {
        const pre = preCleanupItems?.[idx];
        return {
          name: item.name,
          qty: item.quantity,
          price: item.unitPrice,
          total: item.totalPrice,
          review: item.needsReview || false,
          darali: pre?.darali ?? null,
          rawCols: pre?.rawColumns ? pre.rawColumns.slice(-4) : null, // last 4 for debugging
        };
      }),
    };

    return new Response(
      JSON.stringify({ success: true, data: sanitized, _debug }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("[parse-invoice] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }
}));
