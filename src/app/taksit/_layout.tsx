import { Stack } from 'expo-router';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function TaksitLayout() {
  return (
    <ModuleRouteStack module="cariler">
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </ModuleRouteStack>
  );
}
