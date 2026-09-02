import { Tabs } from 'expo-router';
import { CalendarRange, ChartNoAxesColumnIncreasing, Dumbbell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/design-system/use-app-theme';
import { tabBarSafeAreaStyle } from '@/design-system/v2.2/tab-bar-metrics';
import { borders, palette, typography } from '@/design-system/v2.2/tokens';

export default function TabsLayout() {
  const theme = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const tabBarInsets = tabBarSafeAreaStyle(bottom);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.canvas,
        },
        tabBarActiveBackgroundColor: palette.signal,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          ...typography.caption,
        },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: palette.ink,
          borderTopWidth: borders.emphasis,
          ...tabBarInsets,
        },
        tabBarItemStyle: {
          borderTopWidth: borders.active,
          borderTopColor: 'transparent',
          minHeight: 56,
          minWidth: 48,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarAccessibilityLabel: 'Hoy',
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} strokeWidth={2.2} />,
          title: 'Hoy',
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarAccessibilityLabel: 'Plan',
          tabBarIcon: ({ color, size }) => <CalendarRange color={color} size={size} strokeWidth={2.2} />,
          title: 'Plan',
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarAccessibilityLabel: 'Progreso',
          tabBarIcon: ({ color, size }) => <ChartNoAxesColumnIncreasing color={color} size={size} strokeWidth={2.2} />,
          title: 'Progreso',
        }}
      />
    </Tabs>
  );
}
