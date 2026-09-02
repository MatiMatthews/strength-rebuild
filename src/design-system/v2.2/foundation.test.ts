import { fontAssets, fontFamilies } from './fonts';
import { palette, radii, typography } from './tokens';

describe('V2.2 visual foundation', () => {
  it('exposes the flat brand and semantic safety palette', () => {
    expect(palette).toMatchObject({
      signal: '#E7FF00', ink: '#090B0C', paper: '#F7F8F5',
      success: '#08785F', caution: '#805B00', danger: '#B42318',
    });
  });

  it('locks the structural radius and zero-letter-spacing contracts', () => {
    expect(radii).toEqual({ structural: 0, control: 4, tool: 8 });
    expect(Object.values(typography).every((role) => role.letterSpacing === 0)).toBe(true);
  });

  it('maps every approved local font without a network source', () => {
    expect(Object.keys(fontAssets)).toEqual(Object.values(fontFamilies));
    expect(Object.values(fontAssets)).toHaveLength(5);
    expect(JSON.stringify(fontAssets)).not.toMatch(/https?:/);
  });
});
