import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Button, Card, ErrorText, styles as ui } from '../components/ui';
import { useAppState } from '../context/AppState';
import { billingEnabled, buy, getPremiumPackages, restore } from '../lib/premium';
import { colors } from '../lib/theme';

// Premium is for club organisers. Members join clubs and drives for free.
const PERKS = [
  ['📅', 'Club events and sign-ups', 'Plan drives with a date, meeting point and route. Members reply going, maybe or can\'t make it.'],
  ['🚗', 'Convoy tools', 'Name a lead car and a back-marker, set regroup points, and get an alert when a car falls behind.'],
  ['🗺️', 'Route library', 'Save the club\'s best tested roads so anyone can drive them again.'],
  ['🏁', 'Club drive history', 'Every club drive is logged with who came, the route and how long it took.'],
] as const;

export default function PremiumScreen() {
  const { premium, setPremium, setDevPremium } = useAppState();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (billingEnabled) getPremiumPackages().then(setPackages, (e) => setError(String(e?.message ?? e)));
  }, []);

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusy(id);
    setError(null);
    try {
      const unlocked = await fn();
      setPremium(unlocked);
      if (unlocked) router.back();
      else if (id === 'restore') setError('No B-Roads Premium purchase found for this account.');
    } catch (e) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) setError(err.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={[ui.h1, { color: colors.premium }]}>★ Premium</Text>
      {PERKS.map(([icon, title, body]) => (
        <View key={title} style={{ flexDirection: 'row', gap: 12 }}>
          <Text style={{ fontSize: 26 }}>{icon}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={ui.h2}>{title}</Text>
            <Text style={ui.muted}>{body}</Text>
          </View>
        </View>
      ))}

      {premium && <Text style={[ui.body, { color: colors.good }]}>{"You're on Premium. Start or run your club from the Club screen."}</Text>}

      {billingEnabled ? (
        <>
          {!premium &&
            packages.map((p) => (
              <Button
                key={p.identifier}
                variant="premium"
                title={`${p.product.title} · ${p.product.priceString}`}
                loading={busy === p.identifier}
                onPress={() => run(p.identifier, () => buy(p))}
              />
            ))}
          <Button title="Restore purchases" variant="secondary" loading={busy === 'restore'} onPress={() => run('restore', restore)} />
        </>
      ) : (
        <Card>
          <Text style={ui.body}>{"Billing isn't set up in this build."}</Text>
          <Text style={ui.muted}>
            Add RevenueCat keys (see README) to sell Premium. For testing you can unlock it here.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={ui.body}>Dev unlock</Text>
            <Switch value={premium} onValueChange={setDevPremium} trackColor={{ true: colors.premium }} />
          </View>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
    </ScrollView>
  );
}
