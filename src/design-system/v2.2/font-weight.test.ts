describe('bundled font face selection', () => {
  afterEach(() => jest.resetModules());
  it.each(['android', 'ios', 'web'])('preserves the named bold face on %s', platform => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    const { typography } = jest.requireActual<typeof import('./tokens')>('./tokens');
    expect(typography.title.fontFamily).toBe('BarlowCondensed-Bold');
    expect(typography.title.fontWeight).toBe(platform === 'android' ? '400' : '700');
    expect(typography.display.fontFamily).toBe('BarlowCondensed-ExtraBold');
    expect(typography.display.fontWeight).toBe(platform === 'android' ? '400' : '800');
    expect(typography.bodyStrong.fontFamily).toBe('Barlow-Bold');
    expect(typography.bodyStrong.fontWeight).toBe(platform === 'android' ? '400' : '700');
  });
});
