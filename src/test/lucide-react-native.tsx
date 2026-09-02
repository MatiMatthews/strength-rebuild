import { View } from 'react-native';

type IconProps = {
  size?: number;
};

function TestIcon({ size = 24 }: IconProps) {
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ height: size, width: size }} />;
}

export const ArrowRight = TestIcon;
export const BarChart3 = TestIcon;
export const CalendarCheck2 = TestIcon;
export const CalendarDays = TestIcon;
export const CalendarRange = TestIcon;
export const ChartNoAxesColumnIncreasing = TestIcon;
export const Check = TestIcon;
export const ChevronDown = TestIcon;
export const ChevronRight = TestIcon;
export const Clock3 = TestIcon;
export const Dumbbell = TestIcon;
export const Minus = TestIcon;
export const Plus = TestIcon;
export const Pause = TestIcon;
export const Play = TestIcon;
export const RotateCcw = TestIcon;
export const RefreshCw = TestIcon;
export const Settings = TestIcon;
export const Settings2 = TestIcon;
export const ShieldAlert = TestIcon;
export const ShieldCheck = TestIcon;
export const TrendingUp = TestIcon;
export const X = TestIcon;
