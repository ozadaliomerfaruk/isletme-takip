import { render, screen, within } from '@testing-library/react-native';
import { View } from 'react-native';

import { Modal } from '../Modal';

describe('Modal inline host', () => {
  it('hoists a deeply nested inline layer to the nearest native modal root', () => {
    const view = render(
      <Modal visible>
        <View testID="nested-form-row">
          <Modal inline visible>
            <View testID="inline-picker-layer" />
          </Modal>
        </View>
      </Modal>,
    );

    expect(screen.getByTestId('inline-picker-layer')).toBeTruthy();
    expect(
      within(view.UNSAFE_getByProps({ testID: 'nested-form-row' })).queryByTestId(
        'inline-picker-layer',
      ),
    ).toBeNull();
  });

  it('removes the hosted layer when the inline modal closes', () => {
    const view = render(
      <Modal visible>
        <View>
          <Modal inline visible>
            <View testID="inline-picker-layer" />
          </Modal>
        </View>
      </Modal>,
    );

    view.rerender(
      <Modal visible>
        <View>
          <Modal inline visible={false}>
            <View testID="inline-picker-layer" />
          </Modal>
        </View>
      </Modal>,
    );

    expect(screen.queryByTestId('inline-picker-layer')).toBeNull();
  });
});
