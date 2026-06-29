const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Açılış (startup) optimizasyonu: inlineRequires, modüllerin import anında değil
// İLK KULLANIMDA değerlendirilmesini sağlar → ilk render/TTI hızlanır, gereksiz
// modül grafiği açılışta yüklenmez. experimentalImportSupport KAPALI (import
// semantiğini değiştirip yan-etkili modülleri bozabilir; inlineRequires güvenli kazanç).
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
