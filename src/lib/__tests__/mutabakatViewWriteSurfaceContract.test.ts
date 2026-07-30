import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('mutabakat view seviyesi yazma yuzeyleri', () => {
  const page = read('src/app/mutabakat/[cariId].tsx');
  const report = read('src/components/mutabakat/ReportStep.tsx');
  const row = read('src/components/mutabakat/DiffRow.tsx');

  it('genis QTB ve butun yazma handlerlari tek yetenek kapisina baglidir', () => {
    expect(page).toContain(
      'const { canCreateTransactionType } = usePermissions();',
    );
    expect(page).toContain(
      "const canCreateTransactions = canCreateTransactionType('cari_alis');",
    );
    expect(page).toContain('if (!canCreateTransactionsRef.current || !sonuc || !cari) return;');
    expect(page).toContain(
      'if (!canCreateTransactionsRef.current || addedRows.has(item.satir.rowIndex)) return;',
    );
    expect(page).toContain('canCreateTransactions={canCreateTransactions}');
    expect(page).toContain('visible={queueBarVisible && canCreateTransactions}');
  });

  it('izin epochu ve kuyruk oturumu eski native callbackleri state degismeden reddeder', () => {
    expect(page).toContain('const canCreateTransactionsRef = useRef(canCreateTransactions);');
    expect(page).toContain('const permissionEpochRef = useRef(0);');
    expect(page).toContain('const queueSessionRef = useRef(0);');
    expect(page).toContain("queuePhaseRef.current !== 'open'");
    expect(page).toMatch(
      /const advanceQueue = useCallback\([\s\S]*?permissionEpochRef\.current !== expectedPermissionEpoch[\s\S]*?queueSessionRef\.current !== expectedSession[\s\S]*?queuePhaseRef\.current !== 'open'[\s\S]*?const item = queue\[queueIndex\];/,
    );
    expect(page).toMatch(
      /const pauseQueue = useCallback\([\s\S]*?permissionEpochRef\.current !== expectedPermissionEpoch[\s\S]*?queueSessionRef\.current !== expectedSession[\s\S]*?queuePhaseRef\.current !== 'open'/,
    );
  });

  it('tek tokenli timer izin ve oturum kontrolu yapar', () => {
    expect(page.match(/setTimeout\(/g)).toHaveLength(1);
    expect(page).toContain('const advanceTimerTokenRef = useRef(0);');
    expect(page).toContain('if (advanceTimerTokenRef.current !== token) return;');
    expect(page).toContain('queueSessionRef.current !== session');
    expect(page).toContain('permissionEpochRef.current !== permissionEpoch');
    expect(page).toContain(
      'canCreateTransactionsRef.current !== expectedPermission',
    );
    expect(page).toContain('queuePhaseRef.current !== expectedPhase');
  });

  it('izin degisiminde modal gizlenir ve tree 350 ms sonra tokenli cleanup ile kalkar', () => {
    expect(page).toContain('useLayoutEffect(() => {');
    expect(page).toMatch(
      /canCreateTransactionsRef\.current = canCreateTransactions;[\s\S]*permissionEpochRef\.current \+= 1;[\s\S]*queueSessionRef\.current \+= 1;[\s\S]*setQueueBarVisible\(false\);/,
    );
    expect(page).toContain("queuePhaseRef.current = 'closing';");
    expect(page).toContain("expectedPhase: 'closing'");
    expect(page).toMatch(
      /expectedPhase: 'closing',[\s\S]*onFire: \(\) => \{[\s\S]*setQueue\(\[\]\);[\s\S]*setQueueIndex\(0\);/,
    );
    expect(page).toContain('{currentQueueItem && (');
  });

  it('alert, success ve dismiss callbackleri olustuklari epoch-session-satira baglidir', () => {
    expect(page).toContain(
      'const actionPermissionEpoch = permissionEpochRef.current;',
    );
    expect(page).toContain(
      'const actionQueueSession = queueSessionRef.current;',
    );
    expect(page).toContain(
      'beginQueueSession(remaining, actionPermissionEpoch, actionQueueSession);',
    );
    expect(page).toContain(
      'beginQueueSession([item], actionPermissionEpoch, actionQueueSession);',
    );
    expect(page).toContain('const queueCallbackSession = queueSessionRef.current;');
    expect(page).toContain(
      'const queueCallbackPermissionEpoch = permissionEpochRef.current;',
    );
    expect(page).toMatch(
      /expectedPhase: 'transition',[\s\S]*?onFire: \(\) => \{[\s\S]*?queueSessionRef\.current \+= 1;[\s\S]*?setQueueIndex\(queueIndex \+ 1\);/,
    );
    expect(page).toContain('onDismiss={handleQueueDismiss}');
    expect(page).toContain('onSuccess={handleQueueSuccess}');
  });

  it('rapor toplu ve tekil ekleme aksiyonlarini view seviyesinde gizler', () => {
    expect(report).toContain('canCreateTransactions: boolean;');
    expect(report).toContain(
      'const topluKapali = kirmiziDevam || !canCreateTransactions;',
    );
    expect(report).toContain(
      'canCreateTransactions={canCreateTransactions}',
    );
    expect(report).toContain(
      '{canCreateTransactions && !uyumlu && !yapilamadi && (',
    );
  });

  it('eksik satiri view seviyesinde pasiflestirir ve ekleme ipucunu gizler', () => {
    expect(row).toContain('canCreateTransactions: boolean;');
    expect(row).toContain(
      'onPress={canCreateTransactions ? onPress : undefined}',
    );
    expect(row).toContain(
      'disabled={!canCreateTransactions || added}',
    );
    expect(row).toContain(') : canCreateTransactions ? (');
  });

  it('karsilastirma ve paylasim salt-okunur rolde korunur', () => {
    expect(page).toContain('onShare={handleShare}');
    expect(report).toContain('onShare={onShare}');
    expect(report).toContain('<MissingInTheirsRow');
    expect(report).toContain('<MismatchRow');
    expect(report).toContain('<MatchedRow');
  });
});
