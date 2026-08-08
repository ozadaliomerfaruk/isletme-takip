import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TRANSACTION_CREATOR_LABEL,
  getTransactionCreatorLabel,
} from '@/lib/transactionCreatorLabel';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const baseContext = {
  activeIsletmeId: 'business-a',
  viewerUserId: 'viewer',
  memberLabels: {
    creator: '  Kasiyer Ahmet  ',
  },
};

describe('transaction creator label resolver', () => {
  it('aynı tenant için kırpılmış member_label değerini önce kullanır', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-a',
      creator: { display_name: 'Profil Adı' },
    }, baseContext)).toBe('Kasiyer Ahmet');
  });

  it('member_label boşsa kırpılmış profile display_name değerine düşer', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-a',
      creator: { display_name: '  Profil Adı  ' },
    }, {
      ...baseContext,
      memberLabels: { creator: '   ' },
    })).toBe('Profil Adı');
  });

  it('etiket ve profil adı yoksa ortak kullanıcı fallbackini verir', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-a',
      creator: null,
    }, {
      ...baseContext,
      memberLabels: {},
    })).toBe(DEFAULT_TRANSACTION_CREATOR_LABEL);
  });

  it('yerelleştirilmiş fallback verildiğinde sabit Türkçe metin yerine onu kullanır', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-a',
      creator: null,
    }, {
      ...baseContext,
      memberLabels: {},
      fallbackLabel: 'Shared user',
    })).toBe('Shared user');
  });

  it('runtime objesinde e-posta bulunsa bile onu fallback olarak kullanmaz', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-a',
      creator: {
        display_name: null,
        email: 'gizli@example.com',
      },
    } as Parameters<typeof getTransactionCreatorLabel>[0], {
      ...baseContext,
      memberLabels: {},
    })).toBe(DEFAULT_TRANSACTION_CREATOR_LABEL);
  });

  it('created_by null ise mevcut görünürlük davranışı gibi etiket göstermez', () => {
    expect(getTransactionCreatorLabel({
      created_by: null,
      isletme_id: 'business-a',
    }, baseContext)).toBeNull();
  });

  it('işlemi mevcut kullanıcı oluşturduysa etiket göstermez', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'viewer',
      isletme_id: 'business-a',
      creator: { display_name: 'Ben' },
    }, baseContext)).toBeNull();
  });

  it('başka tenant işlemine aktif tenant member_label değerini uygulamaz', () => {
    expect(getTransactionCreatorLabel({
      created_by: 'creator',
      isletme_id: 'business-b',
      creator: { display_name: 'Kaynak İşletme Kullanıcısı' },
    }, baseContext)).toBe('Kaynak İşletme Kullanıcısı');
  });
});

describe('transaction creator label query contract', () => {
  const hookSource = read('src/hooks/useTransactionCreatorLabels.ts');
  const queryKeySource = read('src/lib/queryKeys.ts');
  const islemSource = read('src/hooks/useIslemler.ts');
  const rootLayoutSource = read('src/app/_layout.tsx');
  const migrationSource = read(
    'supabase/migrations/20260729034451_transaction_creator_labels_rpc.sql',
  );

  it('tenant-cache keyini isletmeUser invalidation prefixi altında namespace eder', () => {
    expect(queryKeySource).toContain(
      "creatorLabels: (isletmeId: string) => ['isletme-users', 'creator-labels', isletmeId] as const",
    );
    expect(queryKeySource).toContain("'isletme-users',");
  });

  it('doğrudan tablo fallbacki olmadan tenant-parametreli dar RPC kullanır', () => {
    expect(hookSource).toContain("'get_transaction_creator_labels'");
    expect(hookSource).toContain('{ p_isletme_id: isletme.id }');
    expect(hookSource).not.toContain(".from('isletme_users')");
    expect(hookSource).not.toMatch(/\.eq\(['"]status|\.neq\(['"]status/);
    expect(hookSource).not.toContain(".select('*')");
  });

  it('fallback etiketini aktif uygulama dilinden çözer', () => {
    const tr = JSON.parse(read('src/i18n/locales/tr/transactions.json'));
    const en = JSON.parse(read('src/i18n/locales/en/transactions.json'));

    expect(hookSource).toContain("t('creatorLabel.sharedUser')");
    expect(tr.creatorLabel.sharedUser).toBe('Ortak kullanıcı');
    expect(en.creatorLabel.sharedUser).toBe('Shared user');
  });

  it('RPC yalnız exact user_id + member_label projeksiyonunu döndürür', () => {
    expect(migrationSource).toMatch(
      /RETURNS TABLE\s*\(\s*user_id uuid,\s*member_label text\s*\)/,
    );
    expect(migrationSource).toContain('target.user_id');
    expect(migrationSource).toContain('target.member_label');
    expect(migrationSource).not.toMatch(
      /target\.(?:permissions|role|status|invite_id)|profiles|email/i,
    );
  });

  it('RPC owner veya aktif shared tenant guardıyla, hedef status filtresiz çalışır', () => {
    expect(migrationSource).toContain('target.isletme_id = p_isletme_id');
    expect(migrationSource).toContain('FROM public.isletmeler AS business');
    expect(migrationSource).toContain('business.id = p_isletme_id');
    expect(migrationSource).toContain('business.user_id = auth.uid()');
    expect(migrationSource).toContain('FROM public.isletme_users AS viewer');
    expect(migrationSource).toContain('viewer.isletme_id = p_isletme_id');
    expect(migrationSource).toContain('viewer.user_id = auth.uid()');
    expect(migrationSource).toContain("viewer.status = 'active'");
    expect(migrationSource).not.toContain('target.status');
    expect(migrationSource).toContain('ORDER BY target.user_id');
  });

  it('RPC yalnız gerçekten işlem oluşturmuş üyelerin etiketini döndürür', () => {
    expect(migrationSource).toContain('FROM public.islemler AS transaction_row');
    expect(migrationSource).toContain(
      'transaction_row.isletme_id = p_isletme_id',
    );
    expect(migrationSource).toContain(
      'transaction_row.created_by = target.user_id',
    );
  });

  it('kişisel etiketi şifresiz React Query disk cacheine yazmaz', () => {
    expect(hookSource).toContain('meta: { persist: false }');
    expect(rootLayoutSource).toContain(
      'shouldDehydrateQuery: neverDehydrateQuery',
    );
  });

  it('SECURITY DEFINER RPC empty search_path ve deny-by-default ACL kullanır', () => {
    expect(migrationSource).toContain('SECURITY DEFINER');
    expect(migrationSource).toContain("SET search_path TO ''");
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM PUBLIC',
    );
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM anon',
    );
    expect(migrationSource).toContain(
      'REVOKE ALL ON FUNCTION public.get_transaction_creator_labels(uuid) FROM authenticated',
    );
    expect(migrationSource).toContain(
      'GRANT EXECUTE ON FUNCTION public.get_transaction_creator_labels(uuid) TO authenticated',
    );
  });

  it('migration mevcut tablo, policy veya veriyi değiştiren ifade içermez', () => {
    expect(migrationSource).not.toMatch(
      /\b(?:ALTER\s+TABLE|CREATE\s+POLICY|DROP|INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\b/i,
    );
  });

  it('creator projeksiyonunda e-posta istemez', () => {
    expect(islemSource).toContain(
      'creator:profiles!islemler_created_by_profiles_fk(display_name)',
    );
    expect(islemSource).not.toContain(
      'creator:profiles!islemler_created_by_profiles_fk(display_name,email)',
    );
  });

  it.each([
    'src/app/islemler/index.tsx',
    'src/app/hesaplar/[id].tsx',
    'src/app/cariler/[id].tsx',
    'src/app/personel/[id].tsx',
    'src/components/reports/EntityTransactionList.tsx',
  ])('%s ortak resolverı kullanır ve e-posta fallbacki içermez', (file) => {
    const source = read(file);

    expect(source).toContain('useTransactionCreatorLabelResolver');
    expect(source).not.toContain('creator.email');
  });

  it('linked cari karşı işletme adını creator label önünde tutar', () => {
    const source = read('src/app/cariler/[id].tsx');

    expect(source).toContain(
      'const displayedCreatorText = otherPartyName || creatorText;',
    );
  });
});
