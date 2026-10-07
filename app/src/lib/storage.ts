import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage can fail (e.g. full disk); none of what we keep is critical.
export async function load(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function save(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const keys = {
  driverName: 'driverName',
  devPremium: 'devPremium',
  memberId: (code: string) => `drive:${code}:memberId`,
};
