import {
  getGroupedListEdgePosition,
  getListEdgePosition,
} from '@/components/ui/listEdgeStyles';

describe('soft list edge positions', () => {
  it('rounds only the outer edges of a flat list', () => {
    expect(getListEdgePosition(0, 1)).toBe('only');
    expect(getListEdgePosition(0, 3)).toBe('first');
    expect(getListEdgePosition(1, 3)).toBe('middle');
    expect(getListEdgePosition(2, 3)).toBe('last');
  });

  it('restarts outer edges after every date header', () => {
    const items = [
      { type: 'header' },
      { type: 'transaction' },
      { type: 'transaction' },
      { type: 'header' },
      { type: 'transaction' },
    ];

    expect(getGroupedListEdgePosition(items, 1)).toBe('first');
    expect(getGroupedListEdgePosition(items, 2)).toBe('last');
    expect(getGroupedListEdgePosition(items, 4)).toBe('only');
  });
});
