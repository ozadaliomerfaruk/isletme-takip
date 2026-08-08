import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  // Global ignores (must be first, standalone object with only ignores key)
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'build/',
      'plugins/',
      'supabase/.temp/',
      '*.config.*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
        destructuredArrayIgnorePattern: '^_',
      }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      /**
       * LAYOUT BARİYERİ — yanlış kalıbı tip/lint düzeyinde imkânsız kılar.
       *
       * Primitifin kendisi yeterli değil, çünkü kimse onu kullanmak zorunda
       * değil: yeni bir ekran eski kalıpla yazılırsa kimse fark etmez. Bu kural
       * CI'ı kırmızıya çevirir; "her yeni ekranı tek tek kontrol etmeyelim"
       * hedefini kapatan parça budur.
       *
       * Neden useSafeAreaInsets YASAKLANMADI: yüzen kontroller (FAB, arama
       * çubuğu, snackbar, footer) onu MEŞRU olarak kullanıyor, kapsam çok geniş
       * olurdu. Gerek de yok — container'a alt padding koymak imkânsız hale
       * gelince çift sayım da imkânsız hale geliyor.
       */
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'react-native-safe-area-context',
            importNames: ['SafeAreaView'],
            message:
              "SafeAreaView NATIVE bir bileşendir; _layout'un inset override'ını (gerçek safe-area + overlay tab bar) GÖRMEZ, bu yüzden alt boşluk bar'ı temizlemez. Bunun yerine '@/components/ui' → Screen kullan. Alt boşluk container'a DEĞİL; kaydırma içeriğine (useContentBottomPadding), footer'a (useFooterBottomPadding) ya da yüzen kontrolün kendisine aittir.",
          },
          {
            name: 'react-native',
            importNames: ['SafeAreaView', 'Modal'],
            message:
              "react-native'in SafeAreaView'ü kullanımdan kalktı — '@/components/ui' → Screen kullan. Modal ise '@/components/ui' → Modal olmalı: o sarmalayıcı içeriği ModalInsets ile sarar; modallar ayrı native pencerede açıldığı için tab bar orada çizilmez ve override'lı inset ~72px hayalet alt boşluk üretir.",
          },
        ],
      }],
    },
  },
  // Bariyerin tek istisnası: primitiflerin KENDİLERİ (sarmaladıkları şeyi
  // içeri almak zorundalar).
  {
    files: ['src/components/ui/Screen.tsx', 'src/components/ui/Modal.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // Node ortamı: yedek/yardımcı scriptler (RN değil; console/process/Buffer/fetch/URL/
  // require globaldir). CI'da yalnız commit'li scripts/ dosyaları taranır.
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
