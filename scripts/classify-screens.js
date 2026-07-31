/**
 * EKRAN SINIFLANDIRICI — alt boşluk hangi kalıba ait?
 *
 * Neden AST: sınıfı belirleyen soru tek cümlelik ama regex'in cevaplayamayacağı
 * bir soru — "SafeAreaView/Screen içinde, kaydırma kabından SONRA gelen KARDEŞ
 * bir JSX elemanı var mı?". Prop içindeki JSX (refreshControl={<RefreshControl/>},
 * ListEmptyComponent={<EmptyState/>}) satır/regex analizini kırıyor; aynı dosya
 * iki koşuda iki farklı sınıfa düşebiliyor. AST bunları prop değeri olarak görür,
 * kardeş saymaz.
 *
 * SINIFLAR
 *   A  → kaydırma kabı var, sonrasında kardeş yok.
 *        Alt boşluk KAYDIRMA İÇERİĞİNE: useContentBottomPadding()
 *   B  → kaydırma kabından sonra kardeş eleman(lar) var (sabit footer/buton çubuğu).
 *        Alt boşluk FOOTER'A: useFooterBottomPadding()
 *   C  → hiç kaydırma kabı yok (içerik baştan sabit).
 *        Alt boşluk en alttaki bloğa: useFooterBottomPadding()
 *
 * Kullanım:  node scripts/classify-screens.js
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const SCROLL = new Set(['ScrollView', 'FlatList', 'FlashList', 'SectionList', 'VirtualizedList']);
const ROOTS = new Set(['SafeAreaView', 'Screen']);

/**
 * AKIŞ DIŞI kardeşler — footer sayılmazlar.
 *
 * Bunlar ya mutlak konumlu yüzen kontroller (kendi insets.bottom'ını taşırlar)
 * ya da ayrı native pencerede açılan modallar. Kaydırmadan sonra gelmeleri
 * "sabit alt aksiyon çubuğu var" anlamına GELMEZ; bu ayrım yapılmazsa
 * islemler/index gibi ekranlar yanlışlıkla B'ye düşer.
 */
const NON_FLOW = new Set([
  'FloatingSearchBar', 'UndoSnackbar', 'GlassFab', 'GlassFabMenuItem',
  'Modal', 'ActionSheet', 'BottomSheet', 'PhotoViewerModal', 'ProductDetailModal',
  'QuickTransactionBar', 'QuickUrunBar', 'CreditCardTransactionBar', 'DailyCashModal',
  'NoteInputModal', 'CariPickerSheet', 'ShareOptionsSheet', 'ListPdfPreviewSheet',
  'PdfExportSheet', 'ExportSheet', 'UrunExportSheet', 'AcceptCodeSheet', 'ShareCodeModal',
  'FinancialDetailModal', 'BalanceEditorModal', 'DetailActionMenu', 'EntityPickerModal',
  'TrendFilterModal', 'CustomDateRangePicker', 'Toast', 'ToastContainer',
]);

function elementName(node) {
  const n = node.openingElement && node.openingElement.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return n.property.name;
  return null;
}

/** Bir JSX ağacında kaydırma kabı VAR MI (prop içindekiler hariç — onlar kardeş değil). */
function containsScroll(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'JSXElement') {
    const name = elementName(node);
    if (name && SCROLL.has(name)) return true;
    return (node.children || []).some(containsScroll);
  }
  if (node.type === 'JSXFragment') return (node.children || []).some(containsScroll);
  if (node.type === 'JSXExpressionContainer') return containsScroll(node.expression);
  if (node.type === 'ConditionalExpression')
    return containsScroll(node.consequent) || containsScroll(node.alternate);
  if (node.type === 'LogicalExpression') return containsScroll(node.right);
  return false;
}

/** Anlamlı JSX çocukları (boşluk metinleri ve yorumlar atılır). */
function realChildren(node) {
  return (node.children || []).filter((c) => {
    if (c.type === 'JSXText') return c.value.trim().length > 0;
    if (c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression') return false;
    return true;
  });
}

/** Bu kardeş akışta yer kaplayan bir footer olabilir mi? */
function isFlowSibling(node) {
  // Koşullu render / fragment: içindekilerden biri akışta ise akışta say.
  if (node.type === 'JSXExpressionContainer') return isFlowSibling(node.expression);
  if (node.type === 'LogicalExpression') return isFlowSibling(node.right);
  if (node.type === 'ConditionalExpression')
    return isFlowSibling(node.consequent) || isFlowSibling(node.alternate);
  if (node.type === 'JSXFragment') return realChildren(node).some(isFlowSibling);
  if (node.type !== 'JSXElement') return false;
  const name = elementName(node);
  if (name && NON_FLOW.has(name)) return false;
  // İsimsiz sarmalayıcı (View) ise içine bak: tek çocuğu akış-dışıysa o da değil.
  if (name === 'View') {
    const kids = realChildren(node);
    if (kids.length && kids.every((k) => !isFlowSibling(k))) return false;
  }
  return true;
}

function classifyRoot(root) {
  const kids = realChildren(root);
  let scrollIdx = -1;
  kids.forEach((k, i) => {
    if (containsScroll(k)) scrollIdx = i;
  });
  if (scrollIdx === -1) return 'C';
  const after = kids.slice(scrollIdx + 1);
  return after.some(isFlowSibling) ? 'B' : 'A';
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node.type) visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    walk(node[key], visit);
  }
}

function classifyFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch (e) {
    return { file, classes: ['PARSE-HATASI: ' + e.message] };
  }
  const classes = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXElement') return;
    const name = elementName(node);
    if (!name || !ROOTS.has(name)) return;
    classes.push(classifyRoot(node) + '@' + node.loc.start.line);
  });
  return { file, classes };
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : require('child_process')
      .execSync('git ls-files "src/**/*.tsx"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .filter((f) => /SafeAreaView|<Screen[\s>]/.test(fs.readFileSync(f, 'utf8')));

const rows = files.map(classifyFile).filter((r) => r.classes.length);
for (const r of rows) {
  console.log(r.classes.join(' ').padEnd(28), path.relative('.', r.file));
}
console.log('\ntoplam:', rows.length, 'dosya');
