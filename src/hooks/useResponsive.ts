import { useWindowDimensions } from 'react-native';

export type DeviceSize = 'phone' | 'tablet';

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const shortestEdge = Math.min(width, height);

  // Tablet detection: shortest edge >= 600px (iPad mini and larger)
  const deviceSize: DeviceSize = shortestEdge >= 600 ? 'tablet' : 'phone';
  const isTablet = deviceSize === 'tablet';
  const isPhone = deviceSize === 'phone';

  // Modal width calculation
  // Phone: full width minus padding
  // Tablet: max 600px or 70% of screen width
  const modalWidth = isTablet ? Math.min(600, width * 0.7) : width - 32;

  // Card width for carousels/grids
  // Phone: full width minus padding
  // Tablet: max 400px or 45% of screen width
  const cardWidth = isTablet ? Math.min(400, width * 0.45) : width - 32;

  // Bottom sheet max height
  // Phone: 80% of screen height
  // Tablet: max 600px or 60% of screen height
  const bottomSheetMaxHeight = isTablet
    ? Math.min(600, height * 0.6)
    : height * 0.8;

  // Grid columns for responsive layouts
  const gridColumns = isTablet ? (isLandscape ? 3 : 2) : 1;

  return {
    width,
    height,
    isLandscape,
    deviceSize,
    isTablet,
    isPhone,
    modalWidth,
    cardWidth,
    bottomSheetMaxHeight,
    gridColumns,
  };
}
