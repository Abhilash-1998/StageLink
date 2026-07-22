import * as Location from "expo-location";
import { Linking } from "react-native";

export type LocationPermState = "granted" | "denied" | "blocked" | "undetermined";

export async function getLocationPermission(): Promise<LocationPermState> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return "granted";
  if (cur.status === "denied" && !cur.canAskAgain) return "blocked";
  return "undetermined";
}

export async function requestLocationPermission(): Promise<LocationPermState> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return "granted";
  if (!cur.canAskAgain) return "blocked";
  const req = await Location.requestForegroundPermissionsAsync();
  if (req.granted) return "granted";
  return req.canAskAgain ? "denied" : "blocked";
}

export async function getCurrentPosition() {
  const state = await getLocationPermission();
  if (state !== "granted") return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return res[0]?.city || res[0]?.subregion || res[0]?.region || null;
  } catch { return null; }
}

export function openAppSettings() { Linking.openSettings(); }
