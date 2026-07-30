import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const FORM_FILES = [
  'src/app/cariler/ekle.tsx',
  'src/app/cariler/duzenle/[id].tsx',
  'src/app/personel/ekle.tsx',
  'src/app/personel/duzenle/[id].tsx',
];

describe('device contact picker source and release contract', () => {
  it('uses the SDK 54 single-contact system picker and never bulk-queries contacts', () => {
    const source = read('src/components/contacts/DeviceContactPickerButton.tsx');

    expect(source).toContain('Contacts.presentContactPickerAsync()');
    expect(source).not.toContain('Contacts.getContactsAsync');
    expect(source).toContain("Platform.OS === 'android'");
    expect(source).toContain('Contacts.requestPermissionsAsync()');
    expect(source).toContain('if (!contact) return');
    expect(source).toContain("if (Platform.OS === 'web') return null");
  });

  it('maps only the selected name fields and phone, not device contact identifiers or media', () => {
    const source = read('src/components/contacts/DeviceContactPickerButton.tsx');

    expect(source).not.toMatch(/contact\.(?:id|email|emails|image|rawImage)/);
    expect(source).toContain('contact.phoneNumbers');
    expect(source).toContain('contact.firstName');
    expect(source).toContain('contact.lastName');
  });

  it.each(FORM_FILES)('%s uses the same picker and save-time phone guard', (file) => {
    const source = read(file);

    expect(source).toContain('DeviceContactPickerButton');
    expect(source).toContain('preparePhoneForSave');
    expect(source).toContain('error={errors.phone}');
  });

  it.each(FORM_FILES)(
    '%s warns from permission-aware cached lists and saves only after explicit confirmation',
    (file) => {
      const source = read(file);
      const alertStart = source.indexOf('Alert.alert(warning.title, warning.message');
      const alertEnd = source.indexOf('return;', alertStart);
      const alertBlock = source.slice(alertStart, alertEnd);

      expect(source).toContain('useCariler(undefined, true, true)');
      expect(source).toContain('usePersonelList(true, true)');
      expect(source).toContain('findPhoneDuplicateMatches(validation.normalizedPhone');
      expect(source).toContain('getPhoneDuplicateWarningCopy(duplicateMatches, i18n.language)');
      expect(source).not.toContain("from '@/lib/supabase'");
      expect(alertStart).toBeGreaterThan(0);
      expect(alertBlock).toContain("{ text: t('common:buttons.cancel'), style: 'cancel' }");
      expect(alertBlock).toMatch(
        /text: warning\.confirmLabel,[\s\S]*onPress: \(\) => void persist(?:Cari|Personel)\(validation\.normalizedPhone\)/,
      );
    },
  );

  it('preserves untouched legacy formatting on both edit forms', () => {
    const cariEdit = read('src/app/cariler/duzenle/[id].tsx');
    const personelEdit = read('src/app/personel/duzenle/[id].tsx');

    expect(cariEdit).toContain('preparePhoneForSave(phone, cari?.phone)');
    expect(personelEdit).toContain('preparePhoneForSave(phone, personel?.phone)');
    expect(cariEdit).toContain("exclude: { entityType: 'cari', id }");
    expect(personelEdit).toContain("exclude: { entityType: 'personel', id }");
    expect(cariEdit).toContain("phone === (cari?.phone ?? '')");
    expect(personelEdit).toContain("phone === (personel?.phone ?? '')");
  });

  it('declares the native module while removing unused Android write access', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
    };
    const appJson = JSON.parse(read('app.json')) as {
      expo: {
        plugins: unknown[];
        android: { blockedPermissions?: string[] };
        ios: {
          privacyManifests: {
            NSPrivacyCollectedDataTypes: Array<{ NSPrivacyCollectedDataType: string }>;
          };
        };
      };
    };

    expect(packageJson.dependencies['expo-contacts']).toBe('~15.0.11');
    expect(appJson.expo.plugins).toContainEqual([
      'expo-contacts',
      expect.objectContaining({ contactsPermission: expect.any(String) }),
    ]);
    expect(appJson.expo.android.blockedPermissions).toContain(
      'android.permission.WRITE_CONTACTS',
    );
    expect(
      appJson.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes
        .map((item) => item.NSPrivacyCollectedDataType),
    ).toContain('NSPrivacyCollectedDataTypePhoneNumber');
  });

  it('localizes the iOS permission description in both app locales', () => {
    const trApp = JSON.parse(read('src/i18n/locales/tr/app.json')) as Record<string, string>;
    const enApp = JSON.parse(read('src/i18n/locales/en/app.json')) as Record<string, string>;

    expect(trApp.NSContactsUsageDescription).toBeTruthy();
    expect(enApp.NSContactsUsageDescription).toBeTruthy();
  });

  it.each([
    'src/i18n/locales/tr/legal.json',
    'src/i18n/locales/en/legal.json',
    'docs/privacy-policy.html',
    'docs/privacy-policy-en.html',
  ])('%s explains selected-only access, no bulk upload, and save-before-server', (file) => {
    const source = read(file).toLocaleLowerCase('tr-TR');
    const isEnglish = file.includes('/en/') || file.endsWith('-en.html');

    if (isEnglish) {
      expect(source).toContain('selected');
      expect(source).toContain('entire address book');
      expect(source).toContain('until the user taps');
    } else {
      expect(source).toContain('seçilen');
      expect(source).toContain('tüm rehberi');
      expect(source).toContain('basmadan sunucuya');
    }
  });
});
