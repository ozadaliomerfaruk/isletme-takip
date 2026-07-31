// Edge Function: Baglantili cari kullanicilarina yeni islem bildirimi gonder
// Bir cari hesaba yeni islem eklendiginde, baglantili (linked) diger isletmeye
// Expo Push Notification gonderir.
//
// Tetikleme: Database webhook (INSERT on islemler) veya client tarafindan cagirilir
// Payload: { record: { id, cari_id, type, amount, description, isletme_id }, type: 'INSERT' }
// Güven sınırı: payload'dan yalnız record.id alınır; diğer alanlar public.islemler'den okunur.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withFnTelemetry, measuredFetch } from "../_shared/telemetry.ts";
import { fetchUnambiguousPushTokenMap } from "../_shared/pushTokenOwnership.ts";
import {
  getBearerToken,
  guardPostRequest,
  isServiceRoleBearer,
  serviceUnavailableResponse,
  unauthorizedResponse,
} from "../_shared/workerAuth.ts";

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

// i18n: islem tipi etiketleri
const islemTypeLabels: Record<string, Record<IslemType, string>> = {
  tr: {
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
  },
  en: {
    gelir: "Income",
    gider: "Expense",
    transfer: "Transfer",
    cari_alis: "Supplier Purchase",
    cari_satis: "Customer Sale",
    cari_odeme: "Supplier Payment",
    cari_tahsilat: "Customer Collection",
    cari_alis_iade: "Purchase Return",
    cari_satis_iade: "Sale Return",
    personel_gider: "Staff Expense",
    personel_odeme: "Staff Payment",
    personel_tahsilat: "Staff Collection",
    personel_satis: "Staff Sale",
    nakit_avans_taksit: "Cash Advance Installment",
  },
};

// i18n: bildirim metinleri
const notificationTexts: Record<string, { title: string; unknownSender: string }> = {
  tr: { title: "Bağlantılı Cari - Yeni İşlem", unknownSender: "Bağlantılı işletme" },
  en: { title: "Linked Client - New Transaction", unknownSender: "Linked business" },
};

function getIslemTypeLabel(type: IslemType, lang: string): string {
  const langLabels = islemTypeLabels[lang] || islemTypeLabels["tr"];
  return langLabels[type] || type;
}

function getTexts(lang: string) {
  return notificationTexts[lang] || notificationTexts["tr"];
}

// Para formatla (işlemin kendi para birimine göre — dil/locale'den bağımsız)
function formatCurrency(amount: number, currency: string = "TRY"): string {
  const localeMap: Record<string, string> = {
    TRY: "tr-TR",
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
  };
  // Altın/Gümüş ISO currency olarak gösterilmez; gram olarak yaz
  if (currency === "XAU" || currency === "XAG") {
    return `${new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} gr`;
  }
  const locale = localeMap[currency];
  try {
    return new Intl.NumberFormat(locale || "tr-TR", {
      style: "currency",
      currency: locale ? currency : "TRY",
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
    }).format(amount);
  }
}

// Dedup: eski app versiyonu (client) + yeni DB trigger aynı anda çağırabilir.
// Aynı islem ID'si 30sn içinde tekrar gelirse atla.
const recentIds = new Map<string, number>();
const DEDUP_TTL_MS = 30_000;
const notifyFailureBody = { success: false, sent: 0 };

interface CanonicalIslem {
  id: string;
  cari_id: string | null;
  type: IslemType;
  amount: number;
  description: string | null;
  isletme_id: string;
  source_currency: string | null;
}

interface CariLink {
  id: string;
  cari_id: string;
  owner_isletme_id: string;
  viewer_isletme_id: string;
}

interface PushTokenRow {
  user_id: string;
  token: string;
  locale: string | null;
}

interface RecipientContext {
  recipientIsletmeId: string;
  senderName: string | null;
  userIds: string[];
}

function notifyResponse(
  success: boolean,
  sent: number,
  status = 200,
): Response {
  return new Response(JSON.stringify({ success, sent }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(withFnTelemetry({
  name: "notify-linked-users",
  // Telemetry must not read an untrusted chunked body before authorization.
  largePayloadProne: true,
}, async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const methodError = guardPostRequest(req, corsHeaders, notifyFailureBody);
  if (methodError) return methodError;

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return unauthorizedResponse(corsHeaders, notifyFailureBody);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceRoleKey) {
    return serviceUnavailableResponse(corsHeaders, notifyFailureBody);
  }

  // Legacy app versions called this function with the signed-in user's JWT.
  // Keep that fire-and-forget call successful but side-effect free. Only the
  // service-role trigger may read canonical rows or send notifications.
  if (!isServiceRoleBearer(req, serviceRoleKey)) {
    return notifyResponse(true, 0);
  }

  try {
    // Admin client olustur (service role key ile)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return notifyResponse(false, 0, 400);
    }

    const recordId =
      typeof payload === "object" &&
        payload !== null &&
        "record" in payload &&
        typeof payload.record === "object" &&
        payload.record !== null &&
        "id" in payload.record &&
        typeof payload.record.id === "string"
        ? payload.record.id.trim()
        : "";

    if (!recordId) return notifyResponse(false, 0, 400);

    // İstemci/webhook payload'ındaki type/amount/description/currency/isletme_id
    // güvenilir değildir. Bildirim için yalnız public.islemler kanonik satırı kullanılır.
    const { data: canonicalRow, error: canonicalError } = await supabaseAdmin
      .schema("public")
      .from("islemler")
      .select(
        "id, cari_id, type, amount, description, isletme_id, source_currency",
      )
      .eq("id", recordId)
      .maybeSingle();

    if (canonicalError) {
      console.error(
        "[notify-linked-users] Canonical transaction query error:",
        canonicalError.message,
      );
      return notifyResponse(false, 0, 500);
    }

    if (!canonicalRow) return notifyResponse(false, 0, 404);

    const record = canonicalRow as CanonicalIslem;

    if (!record.cari_id) return notifyResponse(false, 0, 422);

    // v2: cari_links tablosunda cari_id ile baglantili linkleri bul
    const { data: rawLinks, error: linkError } = await supabaseAdmin
      .from("cari_links")
      .select("id, cari_id, owner_isletme_id, viewer_isletme_id")
      .eq("cari_id", record.cari_id);

    if (linkError) {
      console.error("[notify-linked-users] Link query error:", linkError.message);
      return notifyResponse(false, 0, 500);
    }

    const links = ((rawLinks || []) as CariLink[]).filter(
      (link) =>
        record.isletme_id === link.owner_isletme_id ||
        record.isletme_id === link.viewer_isletme_id,
    );

    if (!rawLinks || rawLinks.length === 0) {
      console.log("[notify-linked-users] No links found for this cari");
      return notifyResponse(true, 0);
    }

    // Aynı cari_id için link bulunsa bile işlem işletmesi linkin iki ucundan biri
    // değilse karşı taraf çıkarımı yapılamaz; fail-closed reddet.
    if (links.length === 0) return notifyResponse(false, 0, 403);

    // Dedup: aynı islem için tekrar çağrıldıysa atla
    const now = Date.now();
    if (recentIds.has(record.id)) {
      const lastSeen = recentIds.get(record.id)!;
      if (now - lastSeen < DEDUP_TTL_MS) {
        console.log(`[notify-linked-users] Dedup: skipping duplicate for islem ${record.id}`);
        return notifyResponse(true, 0);
      }
    }
    recentIds.set(record.id, now);
    // Eski kayıtları temizle
    for (const [id, ts] of recentIds) {
      if (now - ts > DEDUP_TTL_MS) recentIds.delete(id);
    }

    console.log(
      `[notify-linked-users] New transaction: cari_id=${record.cari_id}, type=${record.type}, amount=${record.amount}`
    );

    // Her link icin karsi tarafa bildirim gonder
    let sentCount = 0;

    // Tek toplu sorgu: aynı cihaz tokenı birden çok user_id'ye bağlıysa sahiplik
    // belirsizdir; yeni claim bunu onarana kadar hiçbir sahibine push gönderme.
    const recipientContexts: RecipientContext[] = [];
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
        `[notify-linked-users] Link: link_id=${link.id}, recipient_isletme=${recipientIsletmeId}`
      );

      // Alici isletmenin bilgilerini bul
      const { data: recipientIsletme, error: isletmeError } = await supabaseAdmin
        .from("isletmeler")
        .select("id, user_id, name")
        .eq("id", recipientIsletmeId)
        .single();

      if (isletmeError || !recipientIsletme) {
        console.error(
          "[notify-linked-users] Recipient isletme not found:",
          isletmeError?.message
        );
        continue;
      }

      // Bildirim gonderilecek tum kullanicilari topla: isletme sahibi + aktif ekip uyeleri
      const recipientUserIds: string[] = [recipientIsletme.user_id];

      // Isletmedeki aktif ekip uyelerini bul (cariler modulune erisimi olanlar)
      const { data: teamMembers } = await supabaseAdmin
        .from("isletme_users")
        .select("user_id, permissions")
        .eq("isletme_id", recipientIsletmeId)
        .eq("status", "active");

      if (teamMembers) {
        for (const member of teamMembers) {
          // cariler modulune erisimi olan ekip uyelerini ekle
          const hasCarilerAccess =
            member.permissions?.modules?.cariler === true;
          if (hasCarilerAccess && !recipientUserIds.includes(member.user_id)) {
            recipientUserIds.push(member.user_id);
          }
        }
      }

      // Gonderen isletme adini bul
      const { data: senderIsletme } = await supabaseAdmin
        .from("isletmeler")
        .select("name")
        .eq("id", senderIsletmeId)
        .single();

      recipientContexts.push({
        recipientIsletmeId,
        senderName: senderIsletme?.name || null,
        userIds: recipientUserIds,
      });
    }

    const {
      byUserId: safePushTokensByUser,
      failedChunkMessages,
      ambiguousResponseTokens,
    } = await fetchUnambiguousPushTokenMap<PushTokenRow>(
      recipientContexts.flatMap((context) => context.userIds),
      async (userIds) => {
        const { data, error } = await supabaseAdmin.rpc(
          "get_unambiguous_push_tokens_v1",
          { p_user_ids: userIds },
        );
        return { data: (data || []) as PushTokenRow[], error };
      },
    );
    for (const message of failedChunkMessages) {
      console.error(
        "[notify-linked-users] Safe push token RPC error:",
        message,
      );
    }
    if (ambiguousResponseTokens.size > 0) {
      console.warn(
        `[notify-linked-users] Skipping ${ambiguousResponseTokens.size} ambiguous RPC response token(s)`,
      );
    }

    for (const context of recipientContexts) {
      // Her alici kullaniciya bildirim gonder
      for (const userId of context.userIds) {
        const pushTokenRecord = safePushTokensByUser.get(userId);
        if (!pushTokenRecord) {
          console.log(
            `[notify-linked-users] No push token found: user_id=${userId}`
          );
          continue;
        }

        // Kullanicinin dil tercihini belirle
        const lang = pushTokenRecord.locale?.startsWith("en") ? "en" : "tr";
        const texts = getTexts(lang);
        const senderName = context.senderName || texts.unknownSender;

        // Bildirim mesajini olustur
        const islemTypeLabel = getIslemTypeLabel(record.type as IslemType, lang);
        const formattedAmount = formatCurrency(record.amount, record.source_currency || "TRY");

        const title = texts.title;
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
            isletme_id: context.recipientIsletmeId,
          },
          priority: "high",
          channelId: "default",
        };

        // Push token'i uretim logunda ACIK yazma (hassas): yalniz son 6 karakteri maskele.
        console.log(
          `[notify-linked-users] Sending push notification: ...${String(pushTokenRecord.token).slice(-6)}`
        );

        const pushResponse = await measuredFetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        }, "notify-linked-users");

        const pushResult = await pushResponse.json();

        if (pushResult.data?.status === "error") {
          console.error(
            "[notify-linked-users] Push notification error:",
            pushResult.data.message
          );
        } else {
          sentCount++;
        }

      }
    }

    console.log(`[notify-linked-users] Sent ${sentCount} notifications for ${links.length} links`);

    return notifyResponse(true, sentCount);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[notify-linked-users] Error:", errorMessage);

    return notifyResponse(false, 0, 500);
  }
}));
