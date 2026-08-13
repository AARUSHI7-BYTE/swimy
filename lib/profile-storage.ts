import AsyncStorage from "@react-native-async-storage/async-storage";

export type StoredProfile = {
  userName: string;
  profilePhotoUri: string | null;
  locationLabel: string;
  coordinates: string;
};

function keyFor(phoneNumber: string) {
  return `swimy:profile:${phoneNumber}`;
}

export async function saveStoredProfile(phoneNumber: string, profile: StoredProfile) {
  await AsyncStorage.setItem(keyFor(phoneNumber), JSON.stringify(profile));
}

export async function getStoredProfile(phoneNumber: string): Promise<StoredProfile | null> {
  const raw = await AsyncStorage.getItem(keyFor(phoneNumber));
  return raw ? (JSON.parse(raw) as StoredProfile) : null;
}
