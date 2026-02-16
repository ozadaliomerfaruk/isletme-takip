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

const SYSTEM_PROMPT = `Sen bir Türk fatura/fiş/belge OCR asistanısın. Sana gönderilen belge fotoğrafını analiz edip yapılandırılmış JSON formatında döndüreceksin.

KURALLAR:
1. Tüm sayıları Türk formatından (1.234,56) JavaScript number formatına (1234.56) çevir.
2. Tarihleri YYYY-MM-DD formatında döndür.
3. Birim tespiti: KG, GR, LT, ML, AD, ADET, PAKET, PKT, KUTU, KOLI, M, M2, M3, CM, TON, ÇİFT, TAKIM, PORSIYON, PARÇA. Birim bulamazsan null döndür.
4. KDV oranı sadece 0, 1, 10 veya 20 olabilir. Tespit edemezsen null döndür.
5. Para birimi: TRY, USD, EUR, GBP. Belirtilmemişse null döndür (genelde TRY'dir).
6. Ürün adlarını BÜYÜK HARF olarak, belgede yazıldığı gibi yaz.
7. Eğer fotoğraf hiç ürün içermiyorsa, boş items dizisi döndür.
8. supplierName: Belgenin üst kısmındaki firma/işletme adı.
9. supplierTaxNumber: VKN veya TCKN numarası (10-11 haneli).
10. Birim fiyat ve toplam tutarın çarpımı tutarlı olmalı: quantity * unitPrice ≈ totalPrice.
11. Eğer birim fiyat görünmüyorsa, totalPrice / quantity ile hesapla.

BELGE TİP TESPİTİ:
- "fatura": E-fatura, e-arşiv fatura, temel fatura. ETTN numarası, "fatura" kelimesi, ürün satırları var.
- "irsaliye": E-irsaliye, sevk irsaliyesi. "İrsaliye" kelimesi, sevk tarihi var, genelde KDV yok.
- "fis": Yazar kasa fişi, bilgi fişi. TOPLAM, TOPKDV gibi alanlar, Z/EKÜ numarası.
- "pos_fisi": POS cihazı fişi. SATIŞ, ONAY KODU, kart bilgisi (****XXXX), banka adı.
- "siparis_fisi": El yazısı veya matbaa sipariş fişi. "Sipariş Fişi" başlığı, müşteri adı, kalem listesi.
- "tahsilat_makbuzu": Tahsilat/ödeme makbuzu. "TAHSİLAT" kelimesi, alındı belgesi.
- "odeme_dekontu": Banka havale/EFT dekontu, ödeme belgesi.
- "not": El yazısı not, kısa bilgi notu. Yapı bozuk, sadece metin var.
- "unknown": Hiçbirine uymuyor.

ÖDEME BİLGİSİ ÇIKARIMI:
- POS/kart fişi ise: paymentMethod="kredi_karti", cardLastFour=son 4 hane (****XXXX'den), bankName=işyeri banka adı
- "NAKİT" kelimesi varsa: paymentMethod="nakit"
- Havale/EFT dekontu ise: paymentMethod="banka"
- Tespit edemezsen: paymentInfo=null

ÖDEME DURUMU:
- "VERESİYE", "BORÇ", "VADELİ" ifadeleri varsa: paidStatus="veresiye"
- POS fişi, nakit ödeme, "ÖDENDİ" ifadesi varsa: paidStatus="paid"
- Belli değilse: paidStatus=null

GİDER KATEGORİ ÖNERİSİ:
Belge içeriğine göre bir gider kategorisi öner:
- Temizlik malzemesi, deterjan -> "Temizlik"
- Züccaciye, mutfak eşyası -> "Züccaciye"
- Market, bakkal, gıda -> "Market/Gıda"
- Kuru temizleme, çamaşır -> "Kuru Temizleme"
- Kırtasiye, ofis malz. -> "Kırtasiye"
- Tamir, bakım -> "Bakım-Onarım"
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
      "quantity": 1,
      "unit": "kg" | "adet" | ... | null,
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
              text: "Bu belge fotoğrafını analiz et ve JSON olarak döndür.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
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
      parsed = JSON.parse(textContent);
    } catch {
      console.error("[parse-invoice] Failed to parse Gemini JSON:", textContent);
      throw new Error("Gemini returned invalid JSON");
    }

    // Validate and sanitize the response
    const sanitized: ParsedInvoiceResponse = {
      documentType: VALID_DOCUMENT_TYPES.includes(parsed.documentType)
        ? parsed.documentType
        : "unknown",
      supplierName: parsed.supplierName || null,
      supplierTaxNumber: parsed.supplierTaxNumber || null,
      invoiceDate: parsed.invoiceDate || null,
      invoiceNumber: parsed.invoiceNumber || null,
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
        }))
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
          cardLastFour: parsed.paymentInfo.cardLastFour || null,
          bankName: parsed.paymentInfo.bankName || null,
        }
        : null,
      paidStatus: ["paid", "veresiye"].includes(parsed.paidStatus || "")
        ? parsed.paidStatus
        : null,
      suggestedGiderCategory: parsed.suggestedGiderCategory || null,
    };

    // Filter out empty items
    sanitized.items = sanitized.items.filter(
      (item) => item.name.length > 0 && item.totalPrice > 0,
    );

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
