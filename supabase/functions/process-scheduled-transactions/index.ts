// Edge Function: İleri tarihli işlem hatırlatmaları gönder
// Bu function her gün çalışarak scheduled_date tarihi gelmiş işlemler için bildirim gönderir

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry, measuredFetch } from "../_shared/telemetry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// İşlem tipi tanımı - Ana uygulamadaki IslemType ile senkronize
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

interface IleriTarihliIslem {
  id: string;
  isletme_id: string;
  type: IslemType;
  amount: number;
  description: string | null;
  scheduled_date: string;
  hesap_id: string | null;
  hedef_hesap_id: string | null;
  cari_id: string | null;
  personel_id: string | null;
  kategori_id: string | null;
  status: string;
}

interface PushToken {
  user_id: string;
  token: string;
}

interface Isletme {
  id: string;
  user_id: string;
  name: string;
}

// İşlem tipini Türkçe'ye çevir
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

// Expo Push Notification gönder
async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const message = {
    to: expoPushToken,
    sound: "default",
    title,
    body,
    data: data || {},
    priority: "high",
    channelId: "scheduled-transactions",
  };

  try {
    const response = await measuredFetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    }, "process-scheduled-transactions");

    const result = await response.json();

    if (result.data?.status === "error") {
      console.error("Push notification hatası:", result.data.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Push notification gönderme hatası:", error);
    return false;
  }
}

Deno.serve(withFnTelemetry({ name: "process-scheduled-transactions" }, async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Admin client oluştur (service role key ile)
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

    // Bugünün tarihini al.
    // ÖNEMLİ: Uygulama scheduled_date'i cihazın YEREL takvim tarihinden üretir
    // (date.ts -> formatDateForDB). UTC kullanırsak Türkiye'de (UTC+3) akşam
    // saatlerinde tarih bir gün geride kalır ve işlem yanlış günde tetiklenir.
    // Bu yüzden ana pazar olan Europe/Istanbul saat diliminde "bugün"ü hesaplıyoruz.
    // en-CA locale'i YYYY-MM-DD formatı verir.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
    }).format(new Date());

    console.log(`İleri tarihli işlemler kontrol ediliyor: ${today}`);

    // scheduled_date'i bugün VEYA GEÇMİŞ olan ve status'u pending olan işlemleri bul.
    // '<= today' (eşitlik yerine): cron bir gün çalışmazsa, fonksiyon hata verirse
    // ya da kayıt geçmiş tarihli oluşturulduysa, o kalemler bir sonraki çalıştırmada
    // yakalanır (kendi kendini onarır). Bildirim sonrası status 'notified' olduğundan
    // ana sorgu onları tekrar seçmez -> tek seferlik bildirim, spam yok.
    const { data: islemler, error: fetchError } = await supabaseAdmin
      .from("ileri_tarihli_islemler")
      .select("*")
      .lte("scheduled_date", today)
      .eq("status", "pending");

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`);
    }

    if (!islemler || islemler.length === 0) {
      console.log("Bugün için hatırlatılacak işlem bulunamadı");
      return new Response(
        JSON.stringify({ message: "Hatırlatılacak işlem bulunamadı", notified: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`${islemler.length} adet işlem bulundu`);

    // İşletmeleri ve user_id'leri al
    const isletmeIds = [...new Set(islemler.map((i: IleriTarihliIslem) => i.isletme_id))];

    const { data: isletmeler, error: isletmeError } = await supabaseAdmin
      .from("isletmeler")
      .select("id, user_id, name")
      .in("id", isletmeIds);

    if (isletmeError) {
      throw new Error(`İşletme fetch error: ${isletmeError.message}`);
    }

    // user_id -> isletme map
    const isletmeMap = new Map<string, Isletme>();
    for (const isletme of (isletmeler || []) as Isletme[]) {
      isletmeMap.set(isletme.id, isletme);
    }

    // Push token'ları al
    const userIds = [...new Set((isletmeler || []).map((i: Isletme) => i.user_id))];

    const { data: pushTokens, error: tokenError } = await supabaseAdmin
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", userIds);

    if (tokenError) {
      console.error("Push token fetch error:", tokenError);
    }

    // user_id -> token map
    const tokenMap = new Map<string, string>();
    for (const pt of (pushTokens || []) as PushToken[]) {
      tokenMap.set(pt.user_id, pt.token);
    }

    const results: Array<{
      id: string;
      type: string;
      status: string;
      error?: string;
    }> = [];

    for (const ileriIslem of islemler as IleriTarihliIslem[]) {
      try {
        const isletme = isletmeMap.get(ileriIslem.isletme_id);
        if (!isletme) {
          console.log(`İşletme bulunamadı: ${ileriIslem.isletme_id}`);
          continue;
        }

        const pushToken = tokenMap.get(isletme.user_id);
        if (!pushToken) {
          console.log(`Push token bulunamadı: ${isletme.user_id}`);
          results.push({
            id: ileriIslem.id,
            type: ileriIslem.type,
            status: "no_token",
          });
          continue;
        }

        // Bildirim gönder
        const title = "Bugün Yapılacak İşlem";
        const body = `${getIslemTypeLabel(ileriIslem.type)}: ${formatCurrency(ileriIslem.amount)}${
          ileriIslem.description ? ` - ${ileriIslem.description}` : ""
        }`;

        const success = await sendPushNotification(pushToken, title, body, {
          screen: "/(tabs)",
          islemId: ileriIslem.id,
          type: "scheduled_transaction_reminder",
        });

        if (success) {
          // Status'u notified yap + notified_at zaman damgasını yaz.
          // (notified_at kolonu şemada vardı ama yazılmıyordu; ileride tekrar
          // bildirim throttle'ı / kayıt için gereklidir.)
          await supabaseAdmin
            .from("ileri_tarihli_islemler")
            .update({ status: "notified", notified_at: new Date().toISOString() })
            .eq("id", ileriIslem.id);

          results.push({
            id: ileriIslem.id,
            type: ileriIslem.type,
            status: "notified",
          });

          console.log(`Bildirim gönderildi: ${ileriIslem.id}`);
        } else {
          results.push({
            id: ileriIslem.id,
            type: ileriIslem.type,
            status: "notification_failed",
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
        results.push({
          id: ileriIslem.id,
          type: ileriIslem.type,
          status: "error",
          error: errorMessage,
        });
        console.error(`Hata (${ileriIslem.id}):`, errorMessage);
      }
    }

    const notifiedCount = results.filter((r) => r.status === "notified").length;
    const errorCount = results.filter((r) => r.status === "error" || r.status === "notification_failed").length;

    console.log(`Tamamlandı: ${notifiedCount} bildirim gönderildi, ${errorCount} hata`);

    return new Response(
      JSON.stringify({
        message: `${notifiedCount} bildirim gönderildi, ${errorCount} hata oluştu`,
        notified: notifiedCount,
        errors: errorCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Function hatası:", errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));
