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
  ettn: string | null;
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
  "yekun", "son yekun", "son yekün",
  "fayita sozen", "fatura sözeri",
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
8. supplierName: Belgenin üst kısmındaki firma/işletme adı. Tedarikçiyi (satıcıyı) bul, alıcıyı DEĞİL.
9. supplierTaxNumber: Tedarikçinin VKN veya TCKN numarası (10-11 haneli). Alıcının VKN'sini YAZMA.
10. Birim fiyat ve toplam tutarın çarpımı tutarlı olmalı: quantity * unitPrice ≈ totalPrice.
11. Eğer birim fiyat yazılmamışsa, totalPrice / quantity ile hesapla ve unitPrice'a yaz. Bu ZORUNLU.
12. ETTN numarasını (varsa) ettn alanına yaz. Genelde "ETTN:" etiketiyle bulunur, UUID formatındadır.

ÖNEMLİ - ÜRÜN OLMAYAN SATIRLARI FİLTRELE:
- "Eski bakiye", "Önceki bakiye", "Eski borç", "Genel Toplam", "G.Toplam", "Son bakiye", "Bakiye", "Toplam", "Ara toplam", "Yekün", "Son Yekün" gibi satırları items dizisine EKLEME. Bunlar muhasebe özet bilgileridir, ürün değildir.
- Komisyoncu faturalarındaki RUSUM, NAKLİYE, NAKLİYE KDV gibi ek masraf satırlarını items dizisine EKLEME. Bu tutarları grandTotal hesabına dahil et.

TEDARİKÇİ BAKİYE BİLGİSİ:
- Belgede "Son Bakiye", "Cari Bakiye", "Güncel Bakiye", "Son Cari Bakiyeniz" gibi ifadeler varsa, bu tutarı supplierBalance alanına yaz.
- Bakiye yoksa supplierBalance=null.

BELGE TİP TESPİTİ (ÖNCELİK SIRASI):
- "fatura": E-fatura, e-arşiv fatura, temel fatura. ETTN numarası veya "fatura" kelimesi ve ürün satırları var. ÖNEMLİ: "İrsaliye yerine geçer" ifadesi olan belgeler de FATURA'dır. İrsaliye tipinde olup birim fiyat + tutar + KDV bilgisi OLAN belgeler de fatura olarak sınıflandır (tam mali bilgi içeriyor).
- "irsaliye": E-irsaliye, sevk irsaliyesi. "İrsaliye" kelimesi var, SADECE miktar bilgisi var, fiyat/KDV bilgisi YOK veya 0. Fiyatlı irsaliyeleri "fatura" olarak sınıflandır.
- "kasa_fisi": Yazar kasa fişi, bilgi fişi. Belirli bir tedarikçi/firma adı var (üstte yazıyor) ve ürün satırları mevcut. TOPLAM, KDV, Z No, EKÜ No gibi alanlar. Perakende satış noktasından alınan fiş.
- "fis": Genel fiş, tedarikçi bilgisi belirsiz veya kişisel harcama fişi. Market alışverişi gibi.
- "pos_fisi": POS cihazı fişi. SATIŞ, EMV SATIŞ, ONAY KODU, kart bilgisi (****XXXX), banka adı. Ürün satırı YOKTUR, sadece tutar var.
- "siparis_fisi": El yazısı veya matbaa sipariş fişi. "Sipariş Fişi" başlığı, müşteri adı, kalem listesi. Fiyat bilgisi olabilir veya olmayabilir. Sadece ürün adı + miktar + tarih olan el yazısı notlar da bu kategoriye girer.
- "tahsilat_makbuzu": Tahsilat/ödeme makbuzu. "TAHSİLAT", "Tahsilat Makbuzu" kelimesi, alındı belgesi. Pos tahsilat, nakit tahsilat, çek tahsilat bilgileri.
- "odeme_dekontu": Banka havale/EFT dekontu, ödeme belgesi.
- "not": Mali değeri olmayan belgeler. Geri dönüşüm alındı belgesi, atık toplama belgesi, el yazısı kısa not.
- "unknown": Hiçbirine uymuyor.

SİPARİŞ FİŞİ ÖZEL KURALLARI:
- El yazısı sipariş fişlerinde birim fiyat sütunu boşsa ve sadece miktar + toplam tutar yazılmışsa, unitPrice = totalPrice / quantity ile MUTLAKA hesapla.
- Sipariş fişlerinde KDV genelde belirtilmez. KDV bilgisi yoksa vatRate=0 olarak kaydet.
- Fiyat bilgisi hiç yoksa (sadece ürün adı + miktar), unitPrice=0, totalPrice=0 kaydet ama quantity'yi mutlaka doldur.

İRSALİYE ÖZEL KURALLARI:
- İrsaliyelerde fiyat bilgisi yoksa unitPrice=0, totalPrice=0 olarak kaydet ama quantity'yi MUTLAKA doldur.
- İrsaliyelerde birim genelde KG veya ADET'tir, "Koli" sayısı ayrıca belirtilmişse birimi KG olarak kullan.

ÇOK SAYFALI BELGE TESPİTİ:
- Bazı faturalar birden fazla sayfa olabilir. Her sayfada aynı ETTN, aynı belge numarası ve aynı tedarikçi bilgisi bulunur.
- Son sayfada genelde YEKÜN, SON YEKÜN, GENEL TOPLAM gibi toplam bilgileri yer alır.
- Her sayfayı ayrı analiz ederken, ETTN ve invoiceNumber'ı doğru parse et ki client tarafında birleştirilebilsin.

ÖDEME BİLGİSİ ÇIKARIMI:
- POS/kart fişi ise: paymentMethod="kredi_karti", cardLastFour=son 4 hane (****XXXX'den), bankName=işyeri banka adı
- "NAKİT" kelimesi varsa: paymentMethod="nakit"
- Havale/EFT dekontu ise: paymentMethod="banka"
- Tahsilat makbuzunda ödeme detayı varsa (Kredi Kartı, Nakit, Çek sütunları) ilgili yöntemi seç
- Tespit edemezsen: paymentInfo=null

ÖDEME DURUMU:
- "VERESİYE", "BORÇ", "VADELİ", "Açık Hesap" ifadeleri varsa: paidStatus="veresiye"
- POS fişi, nakit ödeme, "ÖDENDİ" ifadesi varsa: paidStatus="paid"
- Tahsilat makbuzu ise: paidStatus="paid"
- Belli değilse: paidStatus=null

GİDER KATEGORİ ÖNERİSİ:
Belge içeriğine göre bir gider kategorisi öner:
- Temizlik malzemesi, deterjan -> "Temizlik"
- Züccaciye, mutfak eşyası -> "Züccaciye"
- Market, bakkal, gıda -> "Market/Gıda"
- Kuru temizleme, çamaşır -> "Kuru Temizleme"
- Kırtasiye, ofis malz. -> "Kırtasiye"
- Tamir, bakım -> "Bakım-Onarım"
- Et, tavuk, balık -> "Et/Tavuk"
- Sebze, meyve -> "Sebze/Meyve"
- Süt ürünleri, yoğurt, peynir -> "Süt Ürünleri"
- Ekmek, unlu mamül, börek, yufka -> "Fırın"
- Tespit edemezsen: null

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
      "unit": "kg" | "adet" | ... | null,
      "unitPrice": 0.00,
      "vatRate": 0 | 1 | 10 | 20 | null,
      "totalPrice": 0.00
    }
  ],
  "subtotal": null,
  "vatTotal": null,
  "grandTotal": null,
  "supplierBalance": null,
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
        }))
        : [],
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

    // Filter out empty items AND balance/summary lines
    sanitized.items = sanitized.items.filter((item) => {
      // Must have a name
      if (item.name.length === 0) return false;
      // Must have either price or quantity (irsaliye items may have quantity but no price)
      if (item.totalPrice <= 0 && item.quantity <= 0) return false;
      // Filter out balance/summary lines that Gemini might have included
      const nameLower = item.name.toLowerCase()
        .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ü/g, "u")
        .replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g");
      for (const keyword of BALANCE_KEYWORDS) {
        if (nameLower === keyword || nameLower.startsWith(keyword + " ")) {
          return false;
        }
      }
      return true;
    });

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
