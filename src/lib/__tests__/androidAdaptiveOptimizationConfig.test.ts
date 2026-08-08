import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

function collectReactSources(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectReactSources(absolutePath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe('Android adaptive layout and release optimization contract', () => {
  it('enables R8 minification and resource shrinking through Expo build properties', () => {
    const appConfig = JSON.parse(read('app.json'));
    const buildProperties = appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildProperties?.[1]?.android).toMatchObject({
      enableMinifyInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
    });
  });

  it('keeps generated Android projects adaptive and uses optimized R8 defaults', () => {
    const plugin = read('plugins/withBuildConfig.js');

    expect(plugin).toContain("delete mainActivity.$['android:screenOrientation']");
    expect(plugin).toContain("delete mainActivity.$['android:resizeableActivity']");
    expect(plugin).toContain('proguard-android-optimize.txt');
    expect(plugin).toContain('android:statusBarColor');
  });

  it('does not capture a one-time window size inside React screens and modals', () => {
    const sourceFiles = collectReactSources(path.join(root, 'src'));
    const staleDimensionReaders = sourceFiles.filter((filePath) =>
      fs.readFileSync(filePath, 'utf8').includes("Dimensions.get('window')"),
    );

    expect(staleDimensionReaders).toEqual([]);
  });

  it('does not request deprecated Android status bar color or translucency', () => {
    const photoViewer = read('src/components/transaction/PhotoViewerModal.tsx');
    const statusBarTag = photoViewer.match(/<StatusBar\b[^>]*\/>/)?.[0];

    expect(statusBarTag).toBe('<StatusBar barStyle="light-content" />');
  });
});
