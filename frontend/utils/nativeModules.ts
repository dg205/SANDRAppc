import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

// Whether this app build includes a native module. Features added after a
// build (the photo picker, read aloud) only work once the app is rebuilt;
// on an older build, importing them throws, and in development Metro hands
// back an empty module instead of failing the import. Checking first avoids
// both. On web these features have web versions, so they're always there.
export function hasNativeModule(name: string): boolean {
  if (Platform.OS === "web") return true;
  return requireOptionalNativeModule(name) != null;
}
