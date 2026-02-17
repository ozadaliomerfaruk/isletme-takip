// Edge Function: Fatura Fotoğrafını Gemini Flash 2.0 ile Parse Et
// Base64 fotoğraf alır, Gemini Vision API ile yapılandırılmış JSON döndürür

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
  currency: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string | null;
    unitPrice: number;
    vatRate: number | null;
    totalPrice: number;
  }>;
  subtotal: number | null;
  vatTotal: number | null;
  grandTotal: number | null;
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
  "pos_fisi",
  "siparis_fisi",
  "tahsilat_makbuzu",
  "odeme_dekontu",
  "not",
  "unknown",
];

const SYSTEM_PROMPT = `Sen bir Türk fatura/fiş/belge OCR uzmanısın. Sana gönderilen belge fotoğrafını çok dikkatli analiz edip yapılandırılmış JSON formatında döndüreceksin.

ÖNCELİKLİ KURALLAR:
1. Fotoğrafı çok dikkatli oku. Bulanık, eğik, düşük kaliteli veya el yazısı olabilir - en iyi tahminini yap.
2. Tüm sayıları Türk formatından (1.234,56) JavaScript number formatına (1234.56) çevir. Nokta binlik ayracı, virgül ondalık ayracıdır.
3. Tarihleri YYYY-MM-DD formatında döndür. Gün/Ay/Yıl sırasına dikkat et (Türk formatı: GG.AA.YYYY veya GG/AA/YYYY).
4. Para birimi: TRY, USD, EUR, GBP. Belirtilmemişse null döndür (Türkiye'de varsayılan TRY'dir).

ÜRÜN SATIRI ÇIKARIMI (ÇOK ÖNEMLİ):
- Her ürün için: name, quantity, unit, unitPrice, vatRate, totalPrice çıkar.
- Ürün adlarını belgede göründüğü gibi BÜYÜK HARF olarak yaz.
- Barkod numaraları, PLU kodları, stok kodları ürün adına DAHİL ETMEyin. Sadece ürün/hizmet adını yaz.
- Aynı ürün birden fazla satırda tekrar ediyorsa (iade, düzeltme vb. hariç), her satırı ayrı item olarak ekle.

MIKTAR VE BİRİM FİYAT FORMATLARI:
- "2 x 15,50 = 31,00" → quantity=2, unitPrice=15.50, totalPrice=31.00
- "*2    31,00" veya "x2    31,00" → quantity=2, totalPrice=31.00, unitPrice=31.00/2=15.50
- "1,234 KG x 45,00" → quantity=1.234, unit="kg", unitPrice=45.00, totalPrice=55.53
- "ÜRÜN ADI    25,00" (miktar belirtilmemiş) → quantity=1, unitPrice=25.00, totalPrice=25.00
- "%10    -3,50" veya "İND.    -3,50" → Bu indirim satırı, ürün olarak EKLEMEyin.

BİRİM TESPİTİ:
Geçerli birimler (küçük harfle döndür): kg, gram, ton, lt, ml, m, m2, m3, cm, adet, parca, cift, takim, paket, kutu, koli, porsiyon.
Yaygın kısaltmalar: KG/Kg/kg→"kg", GR/Gr/gr/G→"gram", LT/Lt/lt/L→"lt", AD/Ad/Adet/ADET/ADT→"adet", PK/PKT/Paket→"paket", KT/Kutu→"kutu", KL/Koli→"koli", PRC/Parça→"parca", PRS/Porsiyon→"porsiyon", ÇFT/Çift→"cift", TK/Takım→"takim", M/Mt/Metre→"m", CM/Cm→"cm", TON/Ton→"ton", ML/Ml→"ml".
Birim bulamazsan veya belirsizse null döndür.

KDV ORANI:
KDV oranı sadece 0, 1, 10 veya 20 olabilir. Tespit edemezsen null döndür.
Fiş ve kasa fişlerinde %KDV oranı genelde gösterilmez, bu durumda null döndür.

FİYAT DOĞRULAMA (ÇOK ÖNEMLİ):
- quantity × unitPrice ≈ totalPrice olmalı (küçük yuvarlama farkı kabul edilir).
- Eğer birim fiyat görünmüyorsa ama toplam ve miktar varsa: unitPrice = totalPrice / quantity hesapla.
- Eğer toplam görünmüyorsa ama birim fiyat ve miktar varsa: totalPrice = quantity × unitPrice hesapla.
- Eğer sadece bir fiyat varsa ve miktar 1 ise: unitPrice = totalPrice = o fiyat.

İNDİRİM / KAMPANYA SATIRLARI:
- "İNDİRİM", "İND.", "KAMPANYA", "KAMP.", "PUAN", "PUAN İND.", "%XX", "YUVARLAMA" gibi satırlar ürün DEĞİLDİR.
- İndirim satırlarını items dizisine EKLEMEyin.
- Ancak grandTotal'i hesaplarken indirimler düşülmüş son toplamı kullan.

TOPLAM TUTARLAR:
- grandTotal: Belgedeki "TOPLAM", "GENEL TOPLAM", "G.TOPLAM", "NET TOPLAM", "ÖDENECEK TUTAR" değeri.
- subtotal: KDV hariç toplam (varsa).
- vatTotal: KDV toplamı, "TOPKDV", "KDV TOPLAM", "TOP.KDV" (varsa).
- Eğer sadece bir genel toplam varsa grandTotal'e yaz, diğerlerini null bırak.

TEDARİKÇİ BİLGİSİ:
- supplierName: Belgenin üst kısmındaki firma/işletme adı. Tam ticari unvan yerine kısa yaygın adı tercih et.
- supplierTaxNumber: VKN (10 hane) veya TCKN (11 hane). Sadece rakamlardan oluşmalı.
- Fatura numarası (invoiceNumber): Belgedeki fatura/fiş no, seri no, EKÜ no vb.

BELGE TİP TESPİTİ:
- "fatura": E-fatura, e-arşiv fatura, temel fatura. ETTN numarası, "fatura" kelimesi, ürün satırları, KDV detayları var.
- "irsaliye": E-irsaliye, sevk irsaliyesi. "İrsaliye" kelimesi, sevk tarihi var, genelde KDV yok.
- "fis": Yazar kasa fişi, bilgi fişi, market fişi. TOPLAM, TOPKDV, Z/EKÜ numarası, yazar kasa marka adı (HUGIN, BEKO, PROFILO vb.) var.
- "pos_fisi": POS cihazı fişi. SATIŞ, ONAY KODU, kart bilgisi (****XXXX), banka adı, PROVIZYON var. Genelde ürün satırı YOK.
- "siparis_fisi": Sipariş fişi, el yazısı sipariş notu. Müşteri adı, ürün listesi var ama resmi belge değil.
- "tahsilat_makbuzu": Tahsilat/ödeme makbuzu. "TAHSİLAT", "ALINDI" kelimesi.
- "odeme_dekontu": Banka havale/EFT dekontu, ödeme belgesi.
- "not": El yazısı not, kısa bilgi notu, liste. Resmi belge formatı yok.
- "unknown": Hiçbirine uymuyorsa.

EL YAZISI BELGELER:
- El yazısı belgelerde ürün adları kısaltılmış olabilir. Anlaşılabilir kısaltmaları açarak yaz (ör: "Dmt" → "DOMATES", "Ptt" → "PATATES").
- El yazısı rakamlara dikkat et: 1 ve 7, 5 ve 6, 0 ve 6 karışabilir. Toplam tutarla tutarlılığı kontrol et.
- El yazısı belgelerin documentType'ı genelde "not" veya "siparis_fisi" olur.

ÖDEME BİLGİSİ ÇIKARIMI:
- POS/kart fişi ise: paymentMethod="kredi_karti", cardLastFour=son 4 hane (****XXXX veya XXXX formatından), bankName=banka/kurum adı
- "NAKİT", "NAKIT" kelimesi veya nakit ödeme tutarı varsa: paymentMethod="nakit"
- Havale/EFT dekontu ise: paymentMethod="banka"
- Tespit edemezsen: paymentInfo=null

ÖDEME DURUMU:
- "VERESİYE", "BORÇ", "VADELİ", "AÇIK HESAP" ifadeleri varsa: paidStatus="veresiye"
- POS fişi, nakit ödeme, "ÖDENDİ", "TAHSİL EDİLDİ" ifadesi varsa: paidStatus="paid"
- Belli değilse: paidStatus=null

GİDER KATEGORİ ÖNERİSİ:
Belge içeriğine göre bir gider kategorisi öner:
- Temizlik malzemesi, deterjan, çamaşır suyu -> "Temizlik"
- Züccaciye, mutfak eşyası, tabak, bardak -> "Züccaciye"
- Market, bakkal, gıda, et, süt, sebze, meyve, kuruyemiş -> "Market/Gıda"
- Kuru temizleme, çamaşır -> "Kuru Temizleme"
- Kırtasiye, ofis malz., kağıt, kalem -> "Kırtasiye"
- Tamir, bakım, yedek parça, servis -> "Bakım-Onarım"
- Yakıt, benzin, mazot, akaryakıt -> "Yakıt"
- Elektrik, su, doğalgaz, fatura -> "Fatura/Aidat"
- İçecek, alkol, meşrubat -> "İçecek"
- Tespit edemezsen: null

SADECE aşağıdaki JSON yapısını döndür, başka hiçbir metin ekleme:
{
  "documentType": "fatura" | "irsaliye" | "fis" | "pos_fisi" | "siparis_fisi" | "tahsilat_makbuzu" | "odeme_dekontu" | "not" | "unknown",
  "supplierName": "string veya null",
  "supplierTaxNumber": "string veya null",
  "invoiceDate": "YYYY-MM-DD veya null",
  "invoiceNumber": "string veya null",
  "currency": "TRY" | "USD" | "EUR" | "GBP" | null,
  "items": [
    {
      "name": "ÜRÜN ADI",
      "quantity": 1.0,
      "unit": "kg" | "gram" | "lt" | "ml" | "adet" | "paket" | "kutu" | "koli" | "m" | "m2" | "m3" | "cm" | "ton" | "parca" | "cift" | "takim" | "porsiyon" | null,
      "unitPrice": 0.00,
      "vatRate": 0 | 1 | 10 | 20 | null,
      "totalPrice": 0.00
    }
  ],
  "subtotal": null,
  "vatTotal": null,
  "grandTotal": null,
  "paymentInfo": { "paymentMethod": "nakit" | "kredi_karti" | "banka" | null, "cardLastFour": "string veya null", "bankName": "string veya null" } | null,
  "paidStatus": "paid" | "veresiye" | null,
  "suggestedGiderCategory": "string veya null"
}`;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image, mimeType } = await req.json() as {
      image: string;
      mimeType?: string;
    };

    if (!image) {
      return new Response(
        JSON.stringify({ error: "image (base64) is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    // Strip data URI prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageMime = mimeType || "image/jpeg";

    console.log(
      `[parse-invoice] Processing image (${Math.round(base64Data.length / 1024)}KB)`,
    );

    // Call Gemini 2.0 Flash API
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType: imageMime,
                data: base64Data,
              },
            },
            {
              text:
                "Bu belge fotoğrafını çok dikkatli analiz et. Her ürün satırını, fiyatı, miktarı ve birimi doğru oku. Toplam tutarları kontrol et. JSON olarak döndür.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

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

    // Parse JSON response from Gemini
    let parsed: ParsedInvoiceResponse;
    try {
      // Try direct parse first
      parsed = JSON.parse(textContent);
    } catch {
      // Try to extract JSON from markdown code blocks if Gemini wrapped it
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          console.error(
            "[parse-invoice] Failed to parse Gemini JSON:",
            textContent,
          );
          throw new Error("Gemini returned invalid JSON");
        }
      } else {
        console.error(
          "[parse-invoice] Failed to parse Gemini JSON:",
          textContent,
        );
        throw new Error("Gemini returned invalid JSON");
      }
    }

    /** Normalize unit strings from Gemini to standard lowercase forms */
    const UNIT_NORMALIZE: Record<string, string> = {
      KG: "kg", Kg: "kg", kg: "kg", KILO: "kg", KILOGRAM: "kg",
      GR: "gram", Gr: "gram", gr: "gram", G: "gram", GRAM: "gram",
      TON: "ton", Ton: "ton",
      LT: "lt", Lt: "lt", lt: "lt", L: "lt", LITRE: "lt", LTR: "lt",
      ML: "ml", Ml: "ml", ml: "ml",
      M: "m", Mt: "m", MT: "m", METRE: "m",
      M2: "m2", m2: "m2",
      M3: "m3", m3: "m3",
      CM: "cm", Cm: "cm", cm: "cm",
      AD: "adet", Ad: "adet", ADET: "adet", ADT: "adet", adet: "adet",
      PARCA: "parca", PRC: "parca", parca: "parca",
      CIFT: "cift", ÇİFT: "cift", CFT: "cift", cift: "cift",
      TAKIM: "takim", TK: "takim", takim: "takim",
      PAKET: "paket", PKT: "paket", PK: "paket", paket: "paket",
      KUTU: "kutu", KT: "kutu", kutu: "kutu",
      KOLI: "koli", KL: "koli", koli: "koli",
      PORSIYON: "porsiyon", PRS: "porsiyon", porsiyon: "porsiyon",
    };
    const VALID_UNITS = new Set(Object.values(UNIT_NORMALIZE));

    function normalizeUnit(raw: string | null): string | null {
      if (!raw) return null;
      const trimmed = raw.trim();
      return UNIT_NORMALIZE[trimmed] || (VALID_UNITS.has(trimmed) ? trimmed : null);
    }

    /** Check if an item name looks like a discount/non-product line */
    const DISCOUNT_PATTERNS = [
      /^[%İI]ND[İI]?R[İI]?M/i,
      /^KAMPANYA/i,
      /^KAMP\./i,
      /^PUAN/i,
      /^YUVARLAMA/i,
      /^TOPLAM/i,
      /^ARA\s*TOPLAM/i,
      /^GENEL\s*TOPLAM/i,
      /^NET\s*TOPLAM/i,
      /^NAK[İI]T$/i,
      /^KDV\s*TOPLAM/i,
      /^TOPKDV/i,
      /^TOP\.\s*KDV/i,
      /^ÖDENECEK/i,
      /^PARA ÜSTÜ/i,
      /^FİŞ TOPLAMI/i,
    ];

    function isDiscountOrTotalLine(name: string): boolean {
      const trimmed = name.trim();
      return DISCOUNT_PATTERNS.some((p) => p.test(trimmed));
    }

    // Validate and sanitize the response
    const sanitized: ParsedInvoiceResponse = {
      documentType: VALID_DOCUMENT_TYPES.includes(parsed.documentType)
        ? parsed.documentType
        : "unknown",
      supplierName: parsed.supplierName?.trim() || null,
      supplierTaxNumber: parsed.supplierTaxNumber
        ? parsed.supplierTaxNumber.replace(/\D/g, "") || null
        : null,
      invoiceDate: parsed.invoiceDate || null,
      invoiceNumber: parsed.invoiceNumber?.trim() || null,
      currency: parsed.currency || null,
      items: Array.isArray(parsed.items)
        ? parsed.items
          .map((item) => {
            const name = String(item.name || "").trim();
            let quantity = typeof item.quantity === "number" && item.quantity > 0
              ? item.quantity
              : 1;
            let unitPrice = typeof item.unitPrice === "number"
              ? item.unitPrice
              : 0;
            let totalPrice = typeof item.totalPrice === "number"
              ? item.totalPrice
              : 0;

            // Price consistency fixes
            if (totalPrice > 0 && unitPrice === 0 && quantity > 0) {
              // Calculate unit price from total
              unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
            } else if (unitPrice > 0 && totalPrice === 0 && quantity > 0) {
              // Calculate total from unit price
              totalPrice = Math.round(quantity * unitPrice * 100) / 100;
            } else if (
              unitPrice > 0 && totalPrice > 0 && quantity > 0
            ) {
              // Validate consistency - if wildly off, prefer totalPrice
              const expected = quantity * unitPrice;
              const diff = Math.abs(expected - totalPrice);
              if (diff / Math.max(totalPrice, 1) > 0.05) {
                // More than 5% difference: recalculate unitPrice from totalPrice
                unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
              }
            }

            return {
              name,
              quantity,
              unit: normalizeUnit(item.unit),
              unitPrice: Math.abs(unitPrice),
              vatRate: [0, 1, 10, 20].includes(item.vatRate as number)
                ? item.vatRate
                : null,
              totalPrice: Math.abs(totalPrice),
            };
          })
          .filter((item) =>
            // Filter out empty items, zero-price items, and discount/total lines
            item.name.length > 0 &&
            item.totalPrice > 0 &&
            !isDiscountOrTotalLine(item.name)
          )
        : [],
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : null,
      vatTotal: typeof parsed.vatTotal === "number" ? parsed.vatTotal : null,
      grandTotal: typeof parsed.grandTotal === "number"
        ? parsed.grandTotal
        : null,
      paymentInfo: parsed.paymentInfo
        ? {
          paymentMethod: ["nakit", "kredi_karti", "banka"].includes(
              parsed.paymentInfo.paymentMethod || "",
            )
            ? parsed.paymentInfo.paymentMethod
            : null,
          cardLastFour: parsed.paymentInfo.cardLastFour
            ? parsed.paymentInfo.cardLastFour.replace(/\D/g, "").slice(-4) ||
              null
            : null,
          bankName: parsed.paymentInfo.bankName?.trim() || null,
        }
        : null,
      paidStatus: ["paid", "veresiye"].includes(parsed.paidStatus || "")
        ? parsed.paidStatus
        : null,
      suggestedGiderCategory: parsed.suggestedGiderCategory?.trim() || null,
    };

    // If grandTotal is missing but we have items, calculate it
    if (sanitized.grandTotal === null && sanitized.items.length > 0) {
      sanitized.grandTotal = sanitized.items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
      sanitized.grandTotal =
        Math.round(sanitized.grandTotal * 100) / 100;
    }

    console.log(
      `[parse-invoice] Parsed ${sanitized.items.length} items, type: ${sanitized.documentType}, supplier: ${sanitized.supplierName}`,
    );

    return new Response(
      JSON.stringify({ success: true, data: sanitized }),
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
});
