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
  // Launch market is Hyderabad-only; ignore device geocode for city selection.
  return "Hyderabad";
}

export function openAppSettings() { Linking.openSettings(); }
