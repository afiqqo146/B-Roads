import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import Share, { Social } from 'react-native-share';
import { META_APP_ID } from './config';

export type ShareTarget = 'instagram-story' | 'instagram-post' | 'facebook' | 'more';

/** "Genting Sempah, Pahang" for the photo stamp, or coordinates as a fallback. */
export async function describeLocation(lat: number, lng: number): Promise<string> {
  try {
    const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const parts = [a?.name ?? a?.street, a?.city ?? a?.subregion ?? a?.district, a?.region].filter(
      (p, i, all): p is string => !!p && all.indexOf(p) === i && !/^\d/.test(p),
    );
    if (parts.length) return parts.slice(0, 2).join(', ');
  } catch {
    // fall through
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function buildCaption(place: string, driveName?: string): string {
  return [`📍 ${place}`, driveName ? `Pit stop on "${driveName}"` : null, '#BRoads #backroads #carclub #roadtrip']
    .filter(Boolean)
    .join('\n');
}

export async function saveToPhotos(uri: string) {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!granted) throw new Error('Allow photo access to save your pit stop shots.');
  await MediaLibrary.Asset.create(uri);
}

const asFileUrl = (uri: string) => (uri.startsWith('file://') ? uri : `file://${uri}`);

/**
 * Instagram and Facebook don't accept pre-filled captions from other apps, so
 * we copy the caption first and the user pastes it. Returns a hint to show.
 */
export async function sharePhoto(target: ShareTarget, uri: string, caption: string): Promise<string | null> {
  const url = asFileUrl(uri);
  await Clipboard.setStringAsync(caption);
  const pasteHint = 'Caption copied - paste it into your post.';

  try {
    switch (target) {
      case 'instagram-story':
        if (!META_APP_ID) throw new Error('Set EXPO_PUBLIC_META_APP_ID to share to Stories.');
        await Share.shareSingle({
          social: Social.InstagramStories,
          appId: META_APP_ID,
          backgroundImage: url,
          attributionURL: 'https://broads.app',
        });
        return null;
      case 'instagram-post':
        // Instagram picks the image up from the camera roll on iOS.
        if (Platform.OS === 'ios') await saveToPhotos(uri);
        await Share.shareSingle({ social: Social.Instagram, url, type: 'image/jpeg' });
        return pasteHint;
      case 'facebook':
        await Share.shareSingle({ social: Social.Facebook, url, type: 'image/jpeg', appId: META_APP_ID || undefined });
        return pasteHint;
      case 'more':
        await Share.open({ url, type: 'image/jpeg', message: caption, failOnCancel: false });
        return null;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(message)) return null;
    if (target !== 'more' && /not installed|no activity|could not/i.test(message)) {
      // App missing: fall back to the system share sheet.
      await Share.open({ url, type: 'image/jpeg', message: caption, failOnCancel: false });
      return null;
    }
    throw e;
  }
}
