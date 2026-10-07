import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import type { Drive } from '../../../shared/types';
import { Button, ErrorText, styles as ui } from '../components/ui';
import { useAppState } from '../context/AppState';
import { useLocation } from '../hooks/useLocation';
import { getDrive } from '../lib/api';
import { formatDistance, formatDuration } from '../lib/format';
import { buildCaption, describeLocation, saveToPhotos, sharePhoto, type ShareTarget } from '../lib/pitstop';
import { keys, load } from '../lib/storage';
import { colors, radius } from '../lib/theme';

/** Premium: snap a photo at a pit stop, stamp it with where you are, share it. */
export default function PitStopScreen() {
  const { premium } = useAppState();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const { fix } = useLocation();
  const camera = useRef<CameraView>(null);
  const stamp = useRef<View>(null);
  const [drive, setDrive] = useState<Drive | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [snappedAt, setSnappedAt] = useState(0);
  const [place, setPlace] = useState<string>('');
  const [stamped, setStamped] = useState<string | null>(null);
  const [busy, setBusy] = useState<ShareTarget | 'save' | 'snap' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code) load(keys.memberId(code)).then(setMemberId);
  }, [code]);

  if (!premium) return <Redirect href="/premium" />;

  if (!permission) return <View style={ui.screen} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[ui.screen, { padding: 16, gap: 12, justifyContent: 'center' }]}>
        <Text style={ui.h2}>Camera access needed</Text>
        <Text style={ui.muted}>B-Roads needs the camera to take your pit stop photos.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const snap = async () => {
    setBusy('snap');
    setError(null);
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (!pic) return;
      // Fresh snapshot so the stamp shows the time and distance right now.
      if (code) setDrive(await getDrive(code).catch(() => null));
      setPlace(fix ? await describeLocation(fix.lat, fix.lng) : 'Somewhere on a B-road');
      setStamped(null);
      setSnappedAt(Date.now());
      setPhoto(pic.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** Flattens the photo and its overlay into one JPEG, once. */
  const render = async () => {
    if (stamped) return stamped;
    const uri = await captureRef(stamp, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
    setStamped(uri);
    return uri;
  };

  const act = async (target: ShareTarget | 'save') => {
    setBusy(target);
    setError(null);
    setMessage(null);
    try {
      const uri = await render();
      if (target === 'save') {
        await saveToPhotos(uri);
        setMessage('Saved to your photos.');
      } else {
        setMessage(await sharePhoto(target, uri, buildCaption(place, drive?.name)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!photo) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
        <SafeAreaView style={s.cameraUi} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} style={s.close}>
            <Text style={s.closeText}>✕</Text>
          </Pressable>
          <Pressable onPress={snap} disabled={busy === 'snap'} style={s.shutter} accessibilityLabel="Take photo">
            {busy === 'snap' ? <ActivityIndicator color={colors.accent} /> : <View style={s.shutterInner} />}
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const me = drive?.members.find((m) => m.id === memberId);
  const elapsed = drive?.startedAt ? (me?.arrivedAt ?? drive.finishedAt ?? snappedAt) - drive.startedAt : null;

  return (
    <SafeAreaView style={ui.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {/* Everything inside this view ends up in the shared image. */}
        <View ref={stamp} collapsable={false} style={s.frame}>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={s.overlay}>
            <Text style={s.overlayBrand}>
              B<Text style={{ color: colors.accent }}>-</Text>ROADS
            </Text>
            <Text style={s.overlayPlace}>📍 {place}</Text>
            {drive && (
              <Text style={s.overlayMeta}>
                {drive.name}
                {elapsed != null ? ` · ${formatDuration(elapsed, true)} in` : ''}
                {me?.distanceToGoalM != null ? ` · ${formatDistance(me.distanceToGoalM)} to go` : ''}
              </Text>
            )}
          </View>
        </View>

        <View style={s.grid}>
          <Button title="Instagram Story" style={s.gridItem} loading={busy === 'instagram-story'} onPress={() => act('instagram-story')} />
          <Button title="Instagram Post" style={s.gridItem} loading={busy === 'instagram-post'} onPress={() => act('instagram-post')} />
          <Button title="Facebook" variant="secondary" style={s.gridItem} loading={busy === 'facebook'} onPress={() => act('facebook')} />
          <Button title="More…" variant="secondary" style={s.gridItem} loading={busy === 'more'} onPress={() => act('more')} />
        </View>
        {message ? <Text style={[ui.muted, { color: colors.good }]}>{message}</Text> : null}
        <ErrorText>{error}</ErrorText>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Retake" variant="secondary" style={{ flex: 1 }} onPress={() => setPhoto(null)} />
          <Button title="Save" variant="secondary" style={{ flex: 1 }} loading={busy === 'save'} onPress={() => act('save')} />
          <Button title="Back to drive" variant="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  cameraUi: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  close: { alignSelf: 'flex-start', marginLeft: 16, backgroundColor: '#0008', borderRadius: 999, padding: 12 },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  frame: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'flex-end' },
  overlay: { backgroundColor: '#000a', padding: 14, gap: 2 },
  overlayBrand: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  overlayPlace: { color: '#fff', fontSize: 17, fontWeight: '700' },
  overlayMeta: { color: '#ddd', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
});
