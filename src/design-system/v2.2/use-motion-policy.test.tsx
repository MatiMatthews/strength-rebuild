import { renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useMotionPolicy } from './use-motion-policy';

describe('useMotionPolicy', () => {
  it('honors the system preference and removes its listener on unmount', async () => {
    const remove = jest.fn();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove } as never);
    const { result, unmount } = await renderHook(() => useMotionPolicy());
    await waitFor(() => expect(result.current.reducedMotion).toBe(true));
    expect(result.current.duration('row')).toBe(0);
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
