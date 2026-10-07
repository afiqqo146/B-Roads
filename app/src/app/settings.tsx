import { router } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { Button, Card, Field, styles as ui } from '../components/ui';
import { useAppState } from '../context/AppState';
import { API_URL } from '../lib/config';
import { colors } from '../lib/theme';

export default function SettingsScreen() {
  const { driverName, setDriverName, premium } = useAppState();
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Field label="Driver name" value={driverName} onChangeText={setDriverName} placeholder="Shown to your group" autoCapitalize="words" />
      <Card>
        <Text style={ui.h2}>{premium ? '★ Premium' : 'Free plan'}</Text>
        <Text style={ui.muted}>
          {premium
            ? 'Pit stop photos and one-tap Instagram & Facebook posting are unlocked.'
            : 'Upgrade to snap pit stop photos and post them straight to Instagram or Facebook.'}
        </Text>
        <Button title={premium ? 'Manage Premium' : 'Get Premium'} variant="premium" onPress={() => router.push('/premium')} />
      </Card>
      <Text style={[ui.muted, { color: colors.border }]}>Server: {API_URL}</Text>
    </ScrollView>
  );
}
