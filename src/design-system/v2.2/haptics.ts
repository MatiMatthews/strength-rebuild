import * as Haptics from 'expo-haptics';

export type ContractedHaptic = 'readinessAccepted' | 'setCompleted' | 'timerCompleted' | 'destructiveConfirmed';

let contractedHapticsEnabled = true;

/** Allows browser/native automation to suppress physical feedback deterministically. */
export function setContractedHapticsEnabled(enabled: boolean): void {
  contractedHapticsEnabled = enabled;
}

/** Physical feedback is deliberately best-effort and never gates product state. */
export async function playContractedHaptic(event: ContractedHaptic): Promise<void> {
  if (!contractedHapticsEnabled) return;
  try {
    if (event === 'setCompleted') await Haptics.selectionAsync();
    else if (event === 'destructiveConfirmed') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Unsupported hardware and OS-level haptic failures do not change meaning or persistence.
  }
}
