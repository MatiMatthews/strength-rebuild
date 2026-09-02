import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { motionDuration, type MotionKind } from './motion';

export function useMotionPolicy() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const duration = useCallback((kind: MotionKind) => motionDuration(kind, reducedMotion), [reducedMotion]);
  return { duration, reducedMotion };
}
