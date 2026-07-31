import { Stack } from 'expo-router';
import { ModuleRouteStack } from '@/components/navigation/GuardedRouteStack';

export default function VadeLayout() {
  return (
    <ModuleRouteStack module="cariler">
      <Stack.Screen name="index" />
    </ModuleRouteStack>
  );
}
