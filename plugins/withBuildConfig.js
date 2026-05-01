const {
  withAppBuildGradle,
  withGradleProperties,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withBuildConfig(config) {
  // 1. Inject buildFeatures { buildConfig = true } into app/build.gradle
  config = withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes('buildConfig = true') && !contents.includes('buildConfig true')) {
      const match = contents.match(/android\s*\{/);
      if (match) {
        const insertionPoint = match.index + match[0].length;
        const injection = `\n    buildFeatures {\n        buildConfig = true\n    }\n`;
        config.modResults.contents =
          contents.slice(0, insertionPoint) + injection + contents.slice(insertionPoint);
      }
    }
    return config;
  });

  // 2. Set global gradle.properties fallback
  config = withGradleProperties(config, (config) => {
    const key = 'android.defaults.buildfeatures.buildconfig';
    if (!config.modResults.some((item) => item.key === key)) {
      config.modResults.push({ type: 'property', key, value: 'true' });
    }
    return config;
  });

  // 3. Fix broken package declaration in generated MainActivity.kt and MainApplication.kt
  // 4. Remove iOS-specific CFBundle* strings from Android locale resources (breaks lintVitalRelease)
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const pkg = config.android?.package || 'com.isletmetakip.app';
      const javaDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java',
        ...pkg.split('.')
      );

      for (const filename of ['MainActivity.kt', 'MainApplication.kt']) {
        const filePath = path.join(javaDir, filename);
        if (fs.existsSync(filePath)) {
          let content = fs.readFileSync(filePath, 'utf8');
          const correctPkg = `package ${pkg}`;
          const pkgMatch = content.match(/^package\s+\S+/m);
          if (pkgMatch && pkgMatch[0] !== correctPkg) {
            content = content.replace(pkgMatch[0], correctPkg);
            fs.writeFileSync(filePath, content, 'utf8');
          }
        }
      }

      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res'
      );
      if (fs.existsSync(resDir)) {
        const entries = fs.readdirSync(resDir);
        for (const dir of entries) {
          if (!dir.startsWith('values-')) continue;
          const stringsPath = path.join(resDir, dir, 'strings.xml');
          if (!fs.existsSync(stringsPath)) continue;
          let xml = fs.readFileSync(stringsPath, 'utf8');
          const before = xml;
          xml = xml.replace(/\s*<string name="CFBundle[^"]*">[^<]*<\/string>/g, '');
          if (xml !== before) {
            if (xml.match(/<resources>\s*<\/resources>/)) {
              fs.unlinkSync(stringsPath);
            } else {
              fs.writeFileSync(stringsPath, xml, 'utf8');
            }
          }
        }
      }

      return config;
    },
  ]);

  return config;
};
