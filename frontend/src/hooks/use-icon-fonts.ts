// Icon font loader for Expo Go only.
// Native builds / web use autolinking and skip CDN downloads.
// We only load Ionicons — the only set gigZee uses — to keep Expo Go startup fast.

import Constants, { ExecutionEnvironment } from "expo-constants";
import { useFonts } from "expo-font";

const ICON_VECTOR_VERSION = "15.1.1";

const IONICONS_CDN =
  `https://cdn.jsdelivr.net/npm/@expo/vector-icons@${ICON_VECTOR_VERSION}/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf`;

export const useIconFonts = (): readonly [boolean, Error | null] =>
  useFonts(
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
      ? { ionicons: IONICONS_CDN }
      : {},
  );
