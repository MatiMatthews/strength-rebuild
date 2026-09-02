import * as Haptics from 'expo-haptics';

import { playContractedHaptic, setContractedHapticsEnabled } from './haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

describe('contracted production haptics', () => {
  afterEach(() => setContractedHapticsEnabled(true));

  it('can be disabled deterministically without changing the committed action', async () => {
    setContractedHapticsEnabled(false);

    await playContractedHaptic('setCompleted');
    await playContractedHaptic('timerCompleted');

    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});
