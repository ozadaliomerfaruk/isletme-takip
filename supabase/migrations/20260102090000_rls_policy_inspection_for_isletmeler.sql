 -- 1. Son kayıt olan kullanıcıları göster
  SELECT id, email, created_at, raw_user_meta_data
  FROM auth.users
  ORDER BY created_at DESC
  LIMIT 5;

  -- 2. İşletmeler tablosunu göster
  SELECT * FROM isletmeler;