import fs from 'fs';
import path from 'path';

describe('Android legacy ImagePicker permission contract', () => {
  const root = path.resolve(__dirname, '../../..');

  it('does not block storage permissions still requested on older Android versions', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
    const blockedPermissions: string[] = appConfig.expo.android.blockedPermissions ?? [];

    expect(blockedPermissions).not.toContain('android.permission.READ_EXTERNAL_STORAGE');
    expect(blockedPermissions).not.toContain('android.permission.WRITE_EXTERNAL_STORAGE');
  });

  it('limits legacy storage permissions to the Android versions that need them', () => {
    const plugin = fs.readFileSync(path.join(root, 'plugins/withBuildConfig.js'), 'utf8');

    expect(plugin).toContain("name === 'android.permission.READ_EXTERNAL_STORAGE'");
    expect(plugin).toContain("permission.$['android:maxSdkVersion'] = '32'");
    expect(plugin).toContain("name === 'android.permission.WRITE_EXTERNAL_STORAGE'");
    expect(plugin.match(/permission\.\$\['android:maxSdkVersion'\] = '32'/g)).toHaveLength(2);
  });
});
