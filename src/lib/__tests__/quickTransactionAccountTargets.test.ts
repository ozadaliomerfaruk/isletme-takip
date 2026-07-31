import { buildTransactionData } from '@/components/transaction/QuickTransactionBar/utils/transactionBuilder';
import { mapTransactionTypeToApi } from '@/components/transaction/QuickTransactionBar/utils/transactionTypeMapper';

describe('account QuickTransactionBar target mapping', () => {
  it('maps the shared Tahsilat tab to the selected counterparty family', () => {
    expect(mapTransactionTypeToApi('tahsilat', null, 'musteri')).toBe(
      'cari_tahsilat',
    );
    expect(mapTransactionTypeToApi('tahsilat', null, 'tedarikci')).toBe(
      'cari_tahsilat',
    );
    expect(mapTransactionTypeToApi('tahsilat', null, 'personel')).toBe(
      'personel_tahsilat',
    );
  });

  it('writes only personel_id for a personnel collection', () => {
    const result = buildTransactionData({
      type: 'tahsilat',
      tahsilatHedefType: 'personel',
      amount: 250,
      description: '',
      hesapId: 'hesap-1',
      kategoriId: 'kategori-1',
      cariId: 'stale-cari',
      personelId: 'personel-1',
    });

    expect(result).toMatchObject({
      type: 'personel_tahsilat',
      hesap_id: 'hesap-1',
      personel_id: 'personel-1',
    });
    expect(result).not.toHaveProperty('cari_id');
  });

  it('writes only cari_id for a cari collection', () => {
    const result = buildTransactionData({
      type: 'tahsilat',
      tahsilatHedefType: 'musteri',
      amount: 250,
      description: '',
      hesapId: 'hesap-1',
      kategoriId: 'kategori-1',
      cariId: 'cari-1',
      personelId: 'stale-personel',
    });

    expect(result).toMatchObject({
      type: 'cari_tahsilat',
      hesap_id: 'hesap-1',
      cari_id: 'cari-1',
    });
    expect(result).not.toHaveProperty('personel_id');
  });
});
