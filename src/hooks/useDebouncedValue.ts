import { useState, useEffect } from 'react';

/**
 * Bir değeri `delay` ms geciktirerek döndürür.
 *
 * ⚠️ ARAMA KUTUSU KULLANIMI (A2): TextInput'un `value`'su ANLIK state'e (örn. searchQuery)
 * bağlı KALMALI; yalnız FİLTRELEME/gruplama bu geciktirilmiş değeri kullanmalı. Yani:
 *   const [searchQuery, setSearchQuery] = useState('');
 *   const debouncedSearch = useDebouncedValue(searchQuery, 250);
 *   <SearchInput value={searchQuery} onChangeText={setSearchQuery} />   // anlık
 *   const filtered = useMemo(() => ..., [data, debouncedSearch]);       // geciken
 *
 * Ters yapılırsa (input value'yu geciktirmek) harfler geç görünür ve "klavye takılıyor"
 * hissi çözülmek yerine KÖTÜLEŞİR. Binlerce kayıtta her tuş vuruşunda tüm listeyi yeniden
 * filtrelemeyi/gruplamayı önlemek içindir.
 */
export function useDebouncedValue<T>(value: T, delay: number = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
