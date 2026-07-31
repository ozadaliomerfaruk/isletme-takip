import {
  parseCashFlowReportProjectionRows,
  parseCategoryReportTransactionRows,
  parseReportCategoryReferenceRows,
  parseReportEntityReferenceRows,
  parseReportTrendProjectionRows,
  reportCategoryRowsToKategoriler,
  reportEntityRowsToCariler,
  reportEntityRowsToHesaplar,
  reportEntityRowsToPersonel,
} from '@/lib/reportPermissionProjection';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const TRANSACTION_ID = '44444444-4444-4444-8444-444444444444';
const CREATOR_ID = '55555555-5555-4555-8555-555555555555';

describe('reports-only dar projeksiyon parserlari', () => {
  it('hesap referansini raporun ihtiyaci kadar map eder', () => {
    const [hesap] = reportEntityRowsToHesaplar(
      [{
        entity_kind: 'hesap',
        entity_id: ENTITY_ID,
        primary_name: 'Merkez Kasa',
        secondary_name: null,
        entity_type: 'nakit',
        currency: 'TRY',
        balance: '1250.45',
        secret: 'istemciye tasinmamalidir',
      }],
      TENANT_ID,
    );

    expect(hesap).toMatchObject({
      id: ENTITY_ID,
      isletme_id: TENANT_ID,
      name: 'Merkez Kasa',
      type: 'nakit',
      currency: 'TRY',
      balance: 1250.45,
      description: null,
      is_active: true,
      is_archived: false,
    });
    expect(hesap).not.toHaveProperty('secret');
  });

  it('cari ve personel referanslarinda PII alanlarini uretmez', () => {
    const [cari] = reportEntityRowsToCariler(
      [{
        entity_kind: 'cari',
        entity_id: ENTITY_ID,
        primary_name: 'Ada Gida',
        secondary_name: null,
        entity_type: 'tedarikci',
        currency: 'EUR',
        balance: 90,
        phone: '+90 555 000 00 00',
      }],
      TENANT_ID,
    );
    const [personel] = reportEntityRowsToPersonel(
      [{
        entity_kind: 'personel',
        entity_id: ENTITY_ID,
        primary_name: 'Ayse',
        secondary_name: 'Yilmaz',
        entity_type: 'personel',
        currency: 'TRY',
        balance: '-12.5',
        salary: 999999,
      }],
      TENANT_ID,
    );

    expect(cari).toMatchObject({
      name: 'Ada Gida',
      phone: null,
      email: null,
      address: null,
      tax_number: null,
    });
    expect(cari).not.toHaveProperty('salary');
    expect(personel).toMatchObject({
      first_name: 'Ayse',
      last_name: 'Yilmaz',
      phone: null,
      salary: null,
      notes: null,
    });
  });

  it('entity kind, entity type ve para biriminde fail-closed davranir', () => {
    expect(() =>
      parseReportEntityReferenceRows(
        [{
          entity_kind: 'cari',
          entity_id: ENTITY_ID,
          primary_name: 'Cari',
          secondary_name: null,
          entity_type: 'musteri',
          currency: 'TRY',
          balance: 0,
        }],
        'hesap',
      ),
    ).toThrow(/entity_kind/);

    expect(() =>
      reportEntityRowsToHesaplar(
        [{
          entity_kind: 'hesap',
          entity_id: ENTITY_ID,
          primary_name: 'Hesap',
          secondary_name: null,
          entity_type: 'unknown',
          currency: 'TRY',
          balance: 0,
        }],
        TENANT_ID,
      ),
    ).toThrow(/entity_type/);

    expect(() =>
      parseReportEntityReferenceRows([{
        entity_kind: 'hesap',
        entity_id: ENTITY_ID,
        primary_name: 'Hesap',
        secondary_name: null,
        entity_type: 'nakit',
        currency: 'BTC',
        balance: 0,
      }]),
    ).toThrow(/currency/);
  });

  it('nakit akisi aggregate numeric stringlerini guvenli sayiya cevirir', () => {
    expect(parseCashFlowReportProjectionRows([{
      flow_kind: 'outflow',
      kategori_id: CATEGORY_ID,
      kategori_adi: 'Kira',
      kategori_renk: '#FF0000',
      currency: 'TRY',
      islem_count: '3',
      total_amount: '9000.25',
    }])).toEqual([{
      flow_kind: 'outflow',
      kategori_id: CATEGORY_ID,
      kategori_adi: 'Kira',
      kategori_renk: '#FF0000',
      currency: 'TRY',
      islem_count: 3,
      total_amount: 9000.25,
    }]);

    expect(() =>
      parseCashFlowReportProjectionRows([{
        flow_kind: 'incoming',
        kategori_id: null,
        kategori_adi: null,
        kategori_renk: null,
        currency: 'TRY',
        islem_count: 1,
        total_amount: 10,
      }]),
    ).toThrow(/flow_kind/);
  });

  it('kategori metadata projeksiyonunu salt rapor DTOsuna map eder', () => {
    const raw = [{
      id: CATEGORY_ID,
      name: 'Satis',
      type: 'gelir',
      icon: 'tag',
      color: '#00AA00',
      parent_id: null,
      created_by: CREATOR_ID,
    }];

    expect(parseReportCategoryReferenceRows(raw)[0]).toEqual({
      id: CATEGORY_ID,
      name: 'Satis',
      type: 'gelir',
      icon: 'tag',
      color: '#00AA00',
      parent_id: null,
    });
    expect(reportCategoryRowsToKategoriler(raw, TENANT_ID)[0])
      .not.toHaveProperty('created_by', CREATOR_ID);
  });

  it('kategori drilldown satirini trusted tenant ile kurar ve fazladan alanlari atar', () => {
    const [transaction] = parseCategoryReportTransactionRows(
      [{
        id: TRANSACTION_ID,
        type: 'gider',
        amount: '120.55',
        description: 'Kirtasiye',
        date: '2026-07-30T10:00:00+00:00',
        source_currency: null,
        target_currency: null,
        exchange_rate: null,
        created_by: CREATOR_ID,
        created_at: '2026-07-30T10:00:01+00:00',
        updated_at: null,
        kategori_name: 'Ofis',
        amount_currency: 'EUR',
        category_amount: '20.25',
        cari_id: 'sunucudan-gelmemeli',
      }],
      TENANT_ID,
    );

    expect(transaction).toMatchObject({
      id: TRANSACTION_ID,
      isletme_id: TENANT_ID,
      type: 'gider',
      amount: 120.55,
      source_currency: 'EUR',
      target_currency: null,
      created_by: CREATOR_ID,
      kategori: { name: 'Ofis' },
      _categoryAmount: 20.25,
      _reportAmountCurrency: 'EUR',
    });
    expect(transaction.cari_id).toBeNull();
    expect(transaction.hesap_id).toBeNull();
  });

  it('kategori ve trend islem tiplerini allowlist disinda kabul etmez', () => {
    const categoryRow = {
      id: TRANSACTION_ID,
      type: 'admin_only',
      amount: 1,
      description: null,
      date: '2026-07-30T10:00:00+00:00',
      source_currency: 'TRY',
      target_currency: null,
      exchange_rate: null,
      created_by: null,
      created_at: null,
      updated_at: null,
      kategori_name: null,
      amount_currency: 'TRY',
      category_amount: null,
    };
    expect(() =>
      parseCategoryReportTransactionRows([categoryRow], TENANT_ID),
    ).toThrow(/type/);
    expect(() =>
      parseReportTrendProjectionRows([{
        report_date: '2026-07-30',
        type: 'admin_only',
        currency: 'TRY',
        total_amount: 1,
      }]),
    ).toThrow(/type/);
  });

  it('trend gununu, tipini ve tutarini dogrular', () => {
    expect(parseReportTrendProjectionRows([{
      report_date: '2026-07-30',
      type: 'gelir',
      currency: 'USD',
      total_amount: '45.75',
    }])).toEqual([{
      report_date: '2026-07-30',
      type: 'gelir',
      currency: 'USD',
      total_amount: 45.75,
    }]);

    expect(() =>
      parseReportTrendProjectionRows([{
        report_date: '30.07.2026',
        type: 'gelir',
        currency: 'TRY',
        total_amount: 1,
      }]),
    ).toThrow(/report_date/);
  });
});
