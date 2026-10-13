import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateProvider } from '../context/AppState';
import { ClubStateProvider } from '../context/ClubState';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <ClubStateProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="drive/[code]" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="new-drive" options={{ title: 'New drive', presentation: 'modal' }} />
            <Stack.Screen name="join" options={{ title: 'Join a drive', presentation: 'modal' }} />
            <Stack.Screen name="pitstop" options={{ title: 'Pit stop', headerShown: false }} />
            <Stack.Screen name="premium" options={{ title: 'B-Roads Premium', presentation: 'modal' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
            <Stack.Screen name="club/index" options={{ title: 'My club' }} />
            <Stack.Screen name="club/new-event" options={{ title: 'New club event', presentation: 'modal' }} />
            <Stack.Screen name="club/save-route" options={{ title: 'Save to club', presentation: 'modal' }} />
          </Stack>
        </ClubStateProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
