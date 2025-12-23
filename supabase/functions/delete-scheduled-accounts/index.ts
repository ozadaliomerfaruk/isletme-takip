// Edge Function: Zamanlanmış hesap silme işlemi
// Bu function her gün çalışarak scheduled_deletion_at tarihi geçmiş hesapları siler

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

    // Silme tarihi geçmiş işletmeleri bul
    const { data: isletmeler, error: fetchError } = await supabaseAdmin
      .from("isletmeler")
      .select("id, user_id, name")
      .lte("scheduled_deletion_at", new Date().toISOString())
      .not("scheduled_deletion_at", "is", null);

    if (fetchError) {
      throw new Error(`Fetch error: ${fetchError.message}`);
    }

    if (!isletmeler || isletmeler.length === 0) {
      return new Response(
        JSON.stringify({ message: "Silinecek hesap bulunamadı", deleted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; name: string; status: string; error?: string }> = [];

    for (const isletme of isletmeler) {
      try {
        console.log(`Siliniyor: ${isletme.name} (${isletme.id})`);

        // 1. Tüm işlemleri sil
        const { error: islemError } = await supabaseAdmin
          .from("islemler")
          .delete()
          .eq("isletme_id", isletme.id);
        if (islemError) console.error("islemler silme hatası:", islemError);

        // 2. Tüm personeli sil
        const { error: personelError } = await supabaseAdmin
          .from("personel")
          .delete()
          .eq("isletme_id", isletme.id);
        if (personelError) console.error("personel silme hatası:", personelError);

        // 3. Tüm carileri sil
        const { error: cariError } = await supabaseAdmin
          .from("cariler")
          .delete()
          .eq("isletme_id", isletme.id);
        if (cariError) console.error("cariler silme hatası:", cariError);

        // 4. Tüm hesapları sil
        const { error: hesapError } = await supabaseAdmin
          .from("hesaplar")
          .delete()
          .eq("isletme_id", isletme.id);
        if (hesapError) console.error("hesaplar silme hatası:", hesapError);

        // 5. Tüm kategorileri sil
        const { error: kategoriError } = await supabaseAdmin
          .from("kategoriler")
          .delete()
          .eq("isletme_id", isletme.id);
        if (kategoriError) console.error("kategoriler silme hatası:", kategoriError);

        // 6. İşletmeyi sil
        const { error: isletmeError } = await supabaseAdmin
          .from("isletmeler")
          .delete()
          .eq("id", isletme.id);
        if (isletmeError) throw new Error(`İşletme silme hatası: ${isletmeError.message}`);

        // 7. Auth kullanıcısını sil
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
          isletme.user_id
        );
        if (authError) {
          console.error("Auth kullanıcı silme hatası:", authError);
          // Auth hatası olsa bile devam et, veri silinmiş olacak
        }

        results.push({
          id: isletme.id,
          name: isletme.name,
          status: "deleted",
        });

        console.log(`Silindi: ${isletme.name}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata";
        results.push({
          id: isletme.id,
          name: isletme.name,
          status: "error",
          error: errorMessage,
        });
        console.error(`Hata (${isletme.name}):`, errorMessage);
      }
    }

    const successCount = results.filter((r) => r.status === "deleted").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        message: `${successCount} hesap silindi, ${errorCount} hata oluştu`,
        deleted: successCount,
        errors: errorCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("Function hatası:", errorMessage);

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
