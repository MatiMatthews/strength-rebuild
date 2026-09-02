import { spacing } from './tokens';

import { TAB_BAR_CONTENT_HEIGHT, tabBarSafeAreaStyle } from './tab-bar-metrics';

describe('tabBarSafeAreaStyle', () => {
  it('preserves the visual tab height when no bottom inset exists', () => {
    expect(tabBarSafeAreaStyle(0)).toEqual({
      height: TAB_BAR_CONTENT_HEIGHT,
      paddingBottom: spacing.sm,
      paddingTop: spacing.sm,
    });
  });

  it('keeps tab controls above a three-button Android navigation bar', () => {
    expect(tabBarSafeAreaStyle(48)).toEqual({
      height: TAB_BAR_CONTENT_HEIGHT + 48,
      paddingBottom: spacing.sm + 48,
      paddingTop: spacing.sm,
    });
  });

  it('does not allow a negative inset to shrink the tab bar', () => {
    expect(tabBarSafeAreaStyle(-12)).toEqual(tabBarSafeAreaStyle(0));
  });
});
