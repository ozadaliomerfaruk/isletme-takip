// Edge Function: Baglantili cari kullanicilarina yeni islem bildirimi gonder
// Bir cari hesaba yeni islem eklendiginde, baglantili (linked) diger isletmeye
// Expo Push Notification gonderir.
//
// Tetikleme: Database webhook (INSERT on islemler) veya client tarafindan cagirilir
// Payload: { record: { id, cari_id, type, amount, description, isletme_id }, type: 'INSERT' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Islem tipi tanimlari - Ana uygulamadaki IslemType ile senkronize
type IslemType =
  | "gelir"
  | "gider"
  | "transfer"
  | "cari_alis"
  | "cari_satis"
  | "cari_odeme"
  | "cari_tahsilat"
  | "cari_alis_iade"
  | "cari_satis_iade"
  | "personel_gider"
  | "personel_odeme"
  | "personel_tahsilat"
  | "personel_satis"
  | "nakit_avans_taksit";

// Islem tipini Turkce'ye cevir
function getIslemTypeLabel(type: IslemType): string {
  const labels: Record<IslemType, string> = {
    gelir: "Gelir",
    gider: "Gider",
    transfer: "Transfer",
    cari_alis: "Tedarikçiden Alış",
    cari_satis: "Müşteriye Satış",
    cari_odeme: "Tedarikçiye Ödeme",
    cari_tahsilat: "Müşteriden Tahsilat",
    cari_alis_iade: "Alış İadesi",
    cari_satis_iade: "Satış İadesi",
    personel_gider: "Personel Gideri",
    personel_odeme: "Personel Ödemesi",
    personel_tahsilat: "Personelden Tahsilat",
    personel_satis: "Personele Satış",
    nakit_avans_taksit: "Nakit Avans Taksiti",
  };
  return labels[type] || type;
}

// Para formatla
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(amount);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Admin client olustur (service role key ile)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { record, type } = await req.json();

    // Sadece INSERT islemlerini isle, cari_id olmayan islemleri atla
    if (type !== "INSERT" || !record?.cari_id) {
      return new Response(
        JSON.stringify({ message: "Islem gerekmiyor (INSERT degil veya cari_id yok)" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    console.log(
      `[notify-linked-users] Yeni islem: cari_id=${record.cari_id}, type=${record.type}, amount=${record.amount}`
    );

    // v2: cari_links tablosunda cari_id ile baglantili linkleri bul
    const { data: links, error: linkError } = await supabaseAdmin
      .from("cari_links")
      .select("id, cari_id, owner_isletme_id, viewer_isletme_id")
      .eq("cari_id", record.cari_id);

    if (linkError) {
      console.error("[notify-linked-users] Link sorgu hatasi:", linkError.message);
      throw new Error(`Link sorgu hatasi: ${linkError.message}`);
    }

    if (!links || links.length === 0) {
      console.log("[notify-linked-users] Bu cari icin baglanti bulunamadi");
      return new Response(
        JSON.stringify({ message: "Bu cari icin baglanti bulunamadi" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Her link icin karsi tarafa bildirim gonder
    let sentCount = 0;
    const results: unknown[] = [];

    for (const link of links) {
      // Alici: islem yapan kisi owner ise viewer'a, viewer ise owner'a bildir
      const recipientIsletmeId =
        record.isletme_id === link.owner_isletme_id
          ? link.viewer_isletme_id
          : link.owner_isletme_id;

      const senderIsletmeId =
        record.isletme_id === link.owner_isletme_id
          ? link.owner_isletme_id
          : link.viewer_isletme_id;

      console.log(
        `[notify-linked-users] Baglanti: link_id=${link.id}, alici_isletme=${recipientIsletmeId}`
      );

      // Alici isletmenin user_id'sini bul
      const { data: recipientIsletme, error: isletmeError } = await supabaseAdmin
        .from("isletmeler")
        .select("id, user_id, name")
        .eq("id", recipientIsletmeId)
        .single();

      if (isletmeError || !recipientIsletme) {
        console.error(
          "[notify-linked-users] Alici isletme bulunamadi:",
          isletmeError?.message
        );
        continue;
      }

      // Push token'i bul
      const { data: pushTokenRecord, error: tokenError } = await supabaseAdmin
        .from("push_tokens")
        .select("user_id, token")
        .eq("user_id", recipientIsletme.user_id)
        .maybeSingle();

      if (tokenError) {
        console.error("[notify-linked-users] Token sorgu hatasi:", tokenError.message);
      }

      if (!pushTokenRecord) {
        console.log(
          `[notify-linked-users] Push token bulunamadi: user_id=${recipientIsletme.user_id}`
        );
        continue;
      }

      // Gonderen isletme adini bul
      const { data: senderIsletme } = await supabaseAdmin
        .from("isletmeler")
        .select("name")
        .eq("id", senderIsletmeId)
        .single();

      const senderName = senderIsletme?.name || "Bağlantılı işletme";

      // Bildirim mesajini olustur
      const islemTypeLabel = getIslemTypeLabel(record.type as IslemType);
      const formattedAmount = formatCurrency(record.amount);

      const title = "Bağlantılı Cari - Yeni İşlem";
      const body = `${senderName}: ${islemTypeLabel} - ${formattedAmount}${
        record.description ? ` (${record.description})` : ""
      }`;

      // Expo Push Notification gonder
      const message = {
        to: pushTokenRecord.token,
        sound: "default",
        title,
        body,
        data: {
          type: "linked_cari_transaction",
          cari_id: record.cari_id,
          islem_id: record.id,
          isletme_id: recipientIsletmeId,
        },
        priority: "high",
        channelId: "default",
      };

      console.log(`[notify-linked-users] Push notification gonderiliyor: ${pushTokenRecord.token}`);

      const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      const pushResult = await pushResponse.json();

      if (pushResult.data?.status === "error") {
        console.error(
          "[notify-linked-users] Push notification hatasi:",
          pushResult.data.message
        );
      } else {
        sentCount++;
      }

      results.push({
        recipient: recipientIsletme.name,
        result: pushResult,
      });
    }

    console.log(`[notify-linked-users] Toplam ${sentCount}/${links.length} bildirim gonderildi`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        total_links: links.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("[notify-linked-users] Hata:", errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
