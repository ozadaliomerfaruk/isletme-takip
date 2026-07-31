import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const trLegal = JSON.parse(read('src/i18n/locales/tr/legal.json')) as LegalCopy;
const enLegal = JSON.parse(read('src/i18n/locales/en/legal.json')) as LegalCopy;

interface LegalCopy {
  privacyNotice: {
    lastUpdated: string;
    sections: Record<string, { title: string; content: string }>;
  };
  privacy: {
    lastUpdated: string;
    sections: Record<string, { title: string; content: string }>;
  };
}

const APP_AND_WEB_LEGAL_FILES = [
  'src/i18n/locales/tr/legal.json',
  'src/i18n/locales/en/legal.json',
  'docs/privacy-policy.html',
  'docs/privacy-policy-en.html',
  'docs/kvkk.html',
  'docs/kvkk-en.html',
  'docs/account-deletion.html',
  'docs/account-deletion-en.html',
];

describe('privacy and regional rights notice contract', () => {
  it('keeps both languages concise and structurally aligned', () => {
    expect(Object.keys(trLegal.privacy.sections)).toEqual([
      'data',
      'usage',
      'permissions',
      'sharing',
      'retention',
      'rights',
    ]);
    expect(Object.keys(enLegal.privacy.sections)).toEqual(
      Object.keys(trLegal.privacy.sections),
    );
    expect(Object.keys(trLegal.privacyNotice.sections)).toEqual([
      'responsibleParty',
      'information',
      'collectionAndUse',
      'sharing',
      'retentionAndSecurity',
      'rightsAndRequests',
    ]);
    expect(Object.keys(enLegal.privacyNotice.sections)).toEqual(
      Object.keys(trLegal.privacyNotice.sections),
    );
  });

  it('uses the same effective date in app and public documents', () => {
    expect(trLegal.privacy.lastUpdated).toContain('31 Temmuz 2026');
    expect(trLegal.privacyNotice.lastUpdated).toContain('31 Temmuz 2026');
    expect(enLegal.privacy.lastUpdated).toContain('July 31, 2026');
    expect(enLegal.privacyNotice.lastUpdated).toContain('July 31, 2026');

    for (const file of APP_AND_WEB_LEGAL_FILES.slice(2)) {
      const source = read(file);
      expect(source).toMatch(/(?:31 Temmuz 2026|July 31, 2026)/);
    }
  });

  it('does not expose infrastructure brands or make false anonymity promises', () => {
    for (const file of APP_AND_WEB_LEGAL_FILES) {
      const source = read(file);
      expect(source).not.toMatch(/\b(?:Supabase|Expo)\b/i);
      expect(source).not.toMatch(
        /(?:işlem(?:ler)?|transaction(?:s)?|business records?).{0,80}(?:anonim|anonymous)/is,
      );
    }
  });

  it('uses clear data categories while disclosing document processing and overseas infrastructure', () => {
    const trCopy = read('src/i18n/locales/tr/legal.json');
    const enCopy = read('src/i18n/locales/en/legal.json');

    expect(trCopy).toContain('yapay zekâ tabanlı belge işleme');
    expect(trCopy).toContain('yurt dış');
    expect(trCopy).toContain('İşletme ve hesap bilgileri');
    expect(trCopy).toContain('Rehberden yalnızca sizin seçerek');
    expect(trCopy).toContain('Teknik bilgiler');
    expect(enCopy).toContain('AI-based document processing');
    expect(enCopy).toContain('countries other than where you live');
    expect(enCopy).toContain('Business and account information');
    expect(enCopy).toContain('Only the name and phone number you choose');
    expect(enCopy).toContain('Technical information');
  });

  it('keeps the minimum Turkish KVKK collection, rights and application details', () => {
    const trCopy = read('src/i18n/locales/tr/legal.json');

    expect(trCopy).toContain('seçtiğiniz kimlik doğrulama sağlayıcısından');
    expect(trCopy).toContain('amaca uygun kullanılıp kullanılmadığını');
    expect(trCopy).toContain('sistemimizde kayıtlı e-posta adresinizden');
  });

  it('uses a US-oriented privacy notice in English without Turkish-law labels', () => {
    const englishNotices = [
      read('src/i18n/locales/en/legal.json'),
      read('src/i18n/locales/en/auth.json'),
      read('src/i18n/locales/en/navigation.json'),
      read('docs/kvkk-en.html'),
      read('docs/privacy-policy-en.html'),
      read('docs/index-en.html'),
    ].join('\n').replace(/(?:href|src)="[^"]+"/g, '');

    expect(englishNotices).toContain('Privacy Notice');
    expect(englishNotices).toContain(
      'applicable U.S. state or other privacy laws',
    );
    expect(englishNotices).toContain('Privacy Request');
    expect(englishNotices).not.toMatch(
      /\b(?:KVKK|Law No\. 6698|Turkish Personal Data Protection Law)\b/i,
    );
    expect(englishNotices).not.toMatch(
      /\bArticle(?:s)?\s+(?:5|8|9|11)(?:\s+and\s+9)?\b/i,
    );
  });

  it('keeps the renamed privacy notice i18n keys aligned in both languages', () => {
    for (const language of ['tr', 'en']) {
      const auth = JSON.parse(
        read(`src/i18n/locales/${language}/auth.json`),
      ) as { register: Record<string, string> };
      const navigation = JSON.parse(
        read(`src/i18n/locales/${language}/navigation.json`),
      ) as {
        screens: Record<string, string>;
        menu: Record<string, string>;
      };

      expect(auth.register.privacyNotice).toBeTruthy();
      expect(navigation.screens.privacyNotice).toBeTruthy();
      expect(navigation.menu.privacyNotice).toBeTruthy();
      expect(auth.register).not.toHaveProperty('kvkkNotice');
      expect(navigation.screens).not.toHaveProperty('kvkk');
      expect(navigation.menu).not.toHaveProperty('kvkk');
    }

    const screen = read('src/app/yasal/kvkk.tsx');
    expect(screen).toContain("t('privacyNotice.title')");
    expect(screen).toContain('privacyNotice.sections');
    expect(screen).not.toContain("t('kvkk");
  });

  it('does not promise unconditional deletion or impossible security', () => {
    const userFacingCopy = [
      ...APP_AND_WEB_LEGAL_FILES,
      'src/i18n/locales/tr/auth.json',
      'src/i18n/locales/en/auth.json',
      'src/i18n/locales/tr/help.json',
      'src/i18n/locales/en/help.json',
      'src/i18n/locales/tr/settings.json',
      'src/i18n/locales/en/settings.json',
      'docs/support.html',
      'docs/support-en.html',
      'docs/terms-of-service.html',
      'docs/terms-of-service-en.html',
    ].map(read).join('\n');

    expect(userFacingCopy).not.toMatch(
      /(?:tüm|bütün|all).{0,80}(?:veri|data).{0,80}(?:kalıcı olarak sil|permanently delet)/is,
    );
    expect(userFacingCopy).not.toMatch(
      /(?:veri|data).{0,80}(?:asla kaybolmaz|cannot be lost)/is,
    );
  });

  it('keeps legal pages reachable before registration and links every notice', () => {
    const layout = read('src/app/_layout.tsx');
    const login = read('src/app/(auth)/login.tsx');
    const register = read('src/app/(auth)/register.tsx');
    const routes = [
      '/yasal/kullanim-kosullari',
      '/yasal/gizlilik-politikasi',
      '/yasal/kvkk',
    ];

    expect(layout).toContain("const inLegal = segments[0] === 'yasal'");
    expect(layout).toContain('!inLegal');
    for (const route of routes) {
      expect(login).toContain(route);
      expect(register).toContain(route);
    }
  });

  it('offers an external account deletion path in both languages', () => {
    const trPage = read('docs/account-deletion.html');
    const enPage = read('docs/account-deletion-en.html');

    expect(trPage).toContain('mailto:ozadaliomerfaruk@gmail.com');
    expect(enPage).toContain('mailto:ozadaliomerfaruk@gmail.com');
    expect(trPage).toContain('7 günlük bekleme süresi');
    expect(enPage).toContain('7-day waiting period');
    expect(read('docs/index.html')).toContain('account-deletion.html');
    expect(read('docs/index-en.html')).toContain('account-deletion-en.html');
    expect(read('docs/privacy-policy.html')).toContain('account-deletion.html');
    expect(read('docs/privacy-policy-en.html')).toContain(
      'account-deletion-en.html',
    );
  });

  it.each(['docs/ekstre/index.html', 'docs/verify/index.html'])(
    '%s links back to the public legal documents',
    (file) => {
      const source = read(file);
      expect(source).toContain('../privacy-policy.html');
      expect(source).toContain('../kvkk.html');
      expect(source).toContain('../terms-of-service.html');
    },
  );

  it('keeps the app and web export description aligned with the actual share flow', () => {
    expect(read('src/i18n/locales/tr/legal.json')).toContain(
      'cihazın paylaşım ekranına hazırlanır',
    );
    expect(read('docs/terms-of-service.html')).toContain(
      'cihazın paylaşım ekranına hazırlanır',
    );
    expect(read('src/i18n/locales/en/legal.json')).toContain(
      "device's sharing interface",
    );
    expect(read('docs/terms-of-service-en.html')).toContain(
      "device's sharing interface",
    );
  });
});
