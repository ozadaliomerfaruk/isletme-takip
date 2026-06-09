import { buildComparisonPdfHtml, type ComparisonPdfData } from '../comparisonPdf';

const base: ComparisonPdfData = {
  title: 'Karşılaştırma',
  businessName: 'Test İşletme',
  rangeLabel: 'Oca 2025 - Ara 2025',
  generatedLabel: 'Tarih',
  generatedValue: '01.01.2026',
  labels: {
    period: 'Dönem',
    income: 'Gelir',
    expense: 'Gider',
    net: 'Net',
    total: 'Toplam',
    average: 'Ortalama',
  },
  rows: [
    { label: 'Ara 2025', income: 1000, expense: 400, net: 600 },
    { label: 'Kas 2025', income: 500, expense: 800, net: -300 },
  ],
  totals: { income: 1500, expense: 1200, net: 300 },
  averages: { income: 750, expense: 600, net: 150 },
  formatAmount: (n) => n.toFixed(2),
};

describe('buildComparisonPdfHtml', () => {
  it('başlık, işletme adı ve etiketleri içerir', () => {
    const html = buildComparisonPdfHtml(base);
    expect(html).toContain('Karşılaştırma');
    expect(html).toContain('Test İşletme');
    expect(html).toContain('Dönem');
    expect(html).toContain('Gelir');
    expect(html).toContain('Toplam');
    expect(html).toContain('Ortalama');
    expect(html).toContain('Oca 2025 - Ara 2025');
  });

  it('satır, toplam ve ortalama tutarlarını formatlayarak yazar', () => {
    const html = buildComparisonPdfHtml(base);
    expect(html).toContain('1000.00'); // satır geliri
    expect(html).toContain('1500.00'); // toplam gelir
    expect(html).toContain('750.00'); // ortalama gelir
    expect(html).toContain('Ara 2025');
    expect(html).toContain('Kas 2025');
  });

  it('negatif nete neg, pozitif nete pos sınıfı uygular', () => {
    const html = buildComparisonPdfHtml(base);
    expect(html).toMatch(/class="amount neg">-300\.00/); // net -300
    expect(html).toMatch(/class="amount pos">600\.00/); // net +600
  });

  it('HTML enjeksiyonunu escape eder', () => {
    const html = buildComparisonPdfHtml({ ...base, businessName: 'A & B <script>x</script>' });
    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});
