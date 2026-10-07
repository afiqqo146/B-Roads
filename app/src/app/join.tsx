import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { JoinedDrive } from '../../../shared/types';
import { Button, ErrorText, Field, styles } from '../components/ui';
import { useAppState } from '../context/AppState';
import { call, getSocket } from '../lib/socket';
import { keys, save } from '../lib/storage';

// Also opened by invite links: broads://join?code=ABC234
export default function JoinScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { driverName, setDriverName } = useAppState();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      const { drive, memberId } = await call<JoinedDrive>((ack) =>
        socket.emit('drive:join', { code: code.trim(), memberName: driverName }, ack),
      );
      await save(keys.memberId(drive.code), memberId);
      router.dismissTo({ pathname: '/drive/[code]', params: { code: drive.code } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>Ask the host for the 6-character drive code.</Text>
        <Field
          label="Drive code"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABC234"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={{ fontSize: 24, letterSpacing: 6, fontWeight: '800' }}
        />
        <Field label="Your name" value={driverName} onChangeText={setDriverName} placeholder="e.g. Farah" autoCapitalize="words" />
        <ErrorText>{error}</ErrorText>
        <Button title="Join drive" onPress={join} loading={busy} disabled={code.trim().length !== 6 || !driverName.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
