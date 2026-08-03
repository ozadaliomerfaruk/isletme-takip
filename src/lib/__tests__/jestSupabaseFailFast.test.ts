import { supabase } from '@/lib/supabase';

describe('global Supabase Jest mock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fails an unconfigured table call instead of returning null-success', () => {
    expect(() => supabase.from('islemler')).toThrow(
      'JEST_SUPABASE_UNEXPECTED_FROM:islemler',
    );
  });

  it('fails an unconfigured RPC call instead of returning null-success', () => {
    expect(() => supabase.rpc('create_islem_atomik_v2', {})).toThrow(
      'JEST_SUPABASE_UNEXPECTED_RPC:create_islem_atomik_v2',
    );
  });
});
