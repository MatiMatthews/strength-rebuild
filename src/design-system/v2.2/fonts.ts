export const fontFamilies = {
  uiRegular: 'Barlow-Regular',
  uiSemiBold: 'Barlow-SemiBold',
  uiBold: 'Barlow-Bold',
  displayBold: 'BarlowCondensed-Bold',
  displayExtraBold: 'BarlowCondensed-ExtraBold',
} as const;

export const fontAssets = {
  [fontFamilies.uiRegular]: require('../../../assets/fonts/Barlow-Regular.ttf'),
  [fontFamilies.uiSemiBold]: require('../../../assets/fonts/Barlow-SemiBold.ttf'),
  [fontFamilies.uiBold]: require('../../../assets/fonts/Barlow-Bold.ttf'),
  [fontFamilies.displayBold]: require('../../../assets/fonts/BarlowCondensed-Bold.ttf'),
  [fontFamilies.displayExtraBold]: require('../../../assets/fonts/BarlowCondensed-ExtraBold.ttf'),
} as const;
