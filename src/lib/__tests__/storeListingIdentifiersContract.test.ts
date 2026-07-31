import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('store listing identifier contract', () => {
  it('keeps review links aligned with the release configuration', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: { android: { package: string } };
    };
    const eas = JSON.parse(read('eas.json')) as {
      submit: { production: { ios: { ascAppId: string } } };
    };
    const reviewContext = read('src/contexts/ReviewContext.tsx');

    expect(reviewContext).toContain(
      `const APP_STORE_ID = '${eas.submit.production.ios.ascAppId}'`,
    );
    expect(reviewContext).toContain(
      `const ANDROID_PACKAGE_NAME = '${app.expo.android.package}'`,
    );
  });

  it('keeps public download links aligned with both store identifiers', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: { android: { package: string } };
    };
    const eas = JSON.parse(read('eas.json')) as {
      submit: { production: { ios: { ascAppId: string } } };
    };

    for (const page of [
      'docs/index.html',
      'docs/index-en.html',
      'docs/ekstre/index.html',
    ]) {
      const source = read(page);
      expect(source).toContain(
        `https://apps.apple.com/app/id${eas.submit.production.ios.ascAppId}`,
      );
      expect(source).toContain(
        `https://play.google.com/store/apps/details?id=${app.expo.android.package}`,
      );
    }
  });

  it('declares linked product, performance and diagnostic collection without tracking', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: {
        ios: {
          privacyManifests: {
            NSPrivacyCollectedDataTypes: Array<{
              NSPrivacyCollectedDataType: string;
              NSPrivacyCollectedDataTypeLinked: boolean;
              NSPrivacyCollectedDataTypeTracking: boolean;
            }>;
          };
        };
      };
    };
    const rows = app.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes;
    const declaredTypes = new Set(
      rows.map((row) => row.NSPrivacyCollectedDataType),
    );

    for (const type of [
      'NSPrivacyCollectedDataTypeProductInteraction',
      'NSPrivacyCollectedDataTypePerformanceData',
      'NSPrivacyCollectedDataTypeOtherDiagnosticData',
    ]) {
      expect(declaredTypes.has(type)).toBe(true);
    }
    expect(rows.every((row) => (
      row.NSPrivacyCollectedDataTypeLinked
      && !row.NSPrivacyCollectedDataTypeTracking
    ))).toBe(true);
  });
});
