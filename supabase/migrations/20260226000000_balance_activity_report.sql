-- Balance Activity Report RPC
-- Returns clients with non-zero balance and their last transaction date
-- Groups by receivables (balance > 0) and payables (balance < 0)

CREATE OR REPLACE FUNCTION get_balance_activity_report(p_isletme_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify caller has access (owner OR active member)
  IF NOT user_has_isletme_access(p_isletme_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_build_object(
    'items', COALESCE((
      SELECT json_agg(row_to_json(t) ORDER BY ABS(t.balance) DESC)
      FROM (
        SELECT
          c.id,
          c.name,
          c.type,
          c.balance::float,
          c.currency,
          c.color,
          max_tx.last_date::text AS last_transaction_date,
          CASE
            WHEN max_tx.last_date IS NOT NULL THEN
              EXTRACT(DAY FROM NOW() - max_tx.last_date)::int
            ELSE NULL
          END AS days_since_last_tx
        FROM cariler c
        LEFT JOIN (
          SELECT cari_id, MAX(date) AS last_date
          FROM islemler
          WHERE isletme_id = p_isletme_id
          GROUP BY cari_id
        ) max_tx ON max_tx.cari_id = c.id
        WHERE c.isletme_id = p_isletme_id
          AND c.is_archived = false
          AND c.balance != 0
      ) t
    ), '[]'::json),
    'summary', COALESCE((
      SELECT json_build_object(
        'total_receivables', COALESCE(SUM(CASE WHEN c.balance > 0 THEN c.balance ELSE 0 END), 0)::float,
        'total_payables', COALESCE(SUM(CASE WHEN c.balance < 0 THEN ABS(c.balance) ELSE 0 END), 0)::float,
        'receivable_count', COUNT(CASE WHEN c.balance > 0 THEN 1 END)::int,
        'payable_count', COUNT(CASE WHEN c.balance < 0 THEN 1 END)::int
      )
      FROM cariler c
      WHERE c.isletme_id = p_isletme_id
        AND c.is_archived = false
        AND c.balance != 0
    ), json_build_object(
      'total_receivables', 0::float,
      'total_payables', 0::float,
      'receivable_count', 0::int,
      'payable_count', 0::int
    ))
  ) INTO result;

  RETURN result;
END;
$$;
