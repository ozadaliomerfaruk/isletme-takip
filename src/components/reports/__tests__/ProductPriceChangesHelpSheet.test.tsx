import { fireEvent, render, screen } from '@testing-library/react-native';
import { ProductPriceChangesHelpSheet } from '../ProductPriceChangesHelpSheet';

const translations: Record<string, string> = {
  'purchaseSales.priceChanges.help.title': 'Bu rapor ne anlatıyor?',
  'purchaseSales.priceChanges.help.subtitle': 'Fiyat değişimlerinin alış maliyetinize etkisi',
  'purchaseSales.priceChanges.help.outcomeTitle': 'Salatalıkta ay sonunda indirim var',
  'purchaseSales.priceChanges.help.startPrice': 'Ay başı',
  'purchaseSales.priceChanges.help.endPrice': 'Ay sonu',
  'purchaseSales.priceChanges.help.netChange': 'Net değişim',
  'purchaseSales.priceChanges.help.netChangeValue': '15 TL düşüş',
  'purchaseSales.priceChanges.help.percentChange': 'Oransal değişim',
  'purchaseSales.priceChanges.help.percentChangeValue': '%37,5 ucuzlama',
  'purchaseSales.priceChanges.help.transitionTitle': '6 kez değişti ne demek?',
  'purchaseSales.priceChanges.help.transitionBody': 'Her alış bir öncekiyle karşılaştırılır.',
  'purchaseSales.priceChanges.help.increase': 'Zam',
  'purchaseSales.priceChanges.help.decrease': 'İndirim',
  'purchaseSales.priceChanges.help.transitionSummary': '2 zam, 4 indirim',
  'purchaseSales.priceChanges.help.referenceTitle': 'Önce bir referans fiyat belirlenir',
  'purchaseSales.priceChanges.help.referenceBody': 'Referans açıklaması',
  'purchaseSales.priceChanges.help.calculationTitle': '1.875 TL tasarruf nasıl çıkıyor?',
  'purchaseSales.priceChanges.help.calculationIntro': '177 kg alış hesabı',
  'purchaseSales.priceChanges.help.tablePrice': 'Fiyat',
  'purchaseSales.priceChanges.help.tableQuantity': 'Miktar',
  'purchaseSales.priceChanges.help.tablePaid': 'Ödenen',
  'purchaseSales.priceChanges.help.tableSavings': 'Tasarruf',
  'purchaseSales.priceChanges.help.tableTotal': 'Toplam',
  'purchaseSales.priceChanges.help.savingsLabel': 'Tahmini tasarruf',
  'purchaseSales.priceChanges.help.savingsFormula': '7.080 TL yerine 5.205 TL ödendi',
  'purchaseSales.priceChanges.help.conclusion': 'Aradaki 1.875 TL daha az ödendi.',
  'purchaseSales.priceChanges.help.whyTitle': 'Bu geçiş zam değil mi?',
  'purchaseSales.priceChanges.help.whyBody': 'Bir önceki alışa göre zam açıklaması',
  'purchaseSales.priceChanges.help.perspectiveTitle': 'Rapor iki farklı şeye bakar',
  'purchaseSales.priceChanges.help.changeCountLabel': 'Zam/indirim sayısı',
  'purchaseSales.priceChanges.help.changeCountBody': 'Önceki fiyatla karşılaştırır.',
  'purchaseSales.priceChanges.help.savingsViewLabel': 'Tahmini tasarruf',
  'purchaseSales.priceChanges.help.savingsViewBody': 'Referans fiyatla karşılaştırır.',
  'purchaseSales.priceChanges.help.note': 'Tasarruf kâr değildir.',
  'purchaseSales.priceChanges.help.gotIt': 'Anladım',
  'purchaseSales.priceChanges.help.close': 'Yardımı kapat',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { resolvedLanguage: 'tr', language: 'tr' },
  }),
}));

jest.mock('@/components/ui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const {
    Pressable,
    Text,
    View,
  } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    BottomSheet: ({
      visible,
      children,
    }: {
      visible: boolean;
      children: React.ReactNode;
    }) => (visible ? React.createElement(View, null, children) : null),
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress: () => void;
    }) => React.createElement(
      Pressable,
      { accessibilityRole: 'button', onPress },
      React.createElement(Text, null, children),
    ),
    Text: ({ children }: { children: React.ReactNode }) => (
      React.createElement(Text, null, children)
    ),
  };
});

jest.mock('lucide-react-native', () => ({
  CircleHelp: () => null,
  X: () => null,
}));

describe('ProductPriceChangesHelpSheet', () => {
  it('shows the cucumber calculation and explains estimated savings', () => {
    render(<ProductPriceChangesHelpSheet visible onDismiss={jest.fn()} />);

    expect(screen.getByText('Salatalıkta ay sonunda indirim var')).toBeTruthy();
    expect(screen.getByText('%37,5 ucuzlama')).toBeTruthy();
    expect(screen.getByText('177 kg')).toBeTruthy();
    expect(screen.getAllByText(/1\.875/).length).toBeGreaterThan(0);
    expect(screen.getByText('7.080 TL yerine 5.205 TL ödendi')).toBeTruthy();
    expect(screen.getByText('Tasarruf kâr değildir.')).toBeTruthy();
  });

  it('closes from the confirmation button', () => {
    const onDismiss = jest.fn();
    render(<ProductPriceChangesHelpSheet visible onDismiss={onDismiss} />);

    fireEvent.press(screen.getByRole('button', { name: 'Anladım' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
