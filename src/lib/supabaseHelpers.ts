/**
 * Supabase Paginated Fetch Helpers
 *
 * Supabase PostgREST API max_rows limiti (varsayılan 1000) nedeniyle
 * büyük veri setlerini sayfa sayfa çekip birleştiren yardımcı fonksiyonlar.
 */

const FETCH_PAGE_SIZE = 500;

/**
 * Supabase sorgusunu sayfa sayfa çalıştırıp tüm sonuçları birleştirir.
 * Export gibi tüm veriyi gerektiren işlemler için kullanılır.
 *
 * NOT: queryBuilder'ı her sayfa için yeniden oluşturmak gerekir çünkü
 * Supabase query builder .range() çağrıldıktan sonra değişir.
 * Bu yüzden bir factory fonksiyonu alıyoruz.
 *
 * @example
 * const data = await fetchAllPages<IslemWithRelations>(() =>
 *   supabase.from('islemler').select('*').eq('isletme_id', id).order('date')
 * );
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllPages<T>(
  queryFactory: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }> },
): Promise<T[]> {
  let allData: T[] = [];
  let page = 0;

  for (;;) {
    const from = page * FETCH_PAGE_SIZE;
    const to = from + FETCH_PAGE_SIZE - 1;

    const { data, error } = await queryFactory().range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];

    if (data.length < FETCH_PAGE_SIZE) break; // Son sayfa
    page++;
  }

  return allData;
}
