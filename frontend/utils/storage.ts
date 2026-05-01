/**
 * storage.ts
 * Thin cross-platform key-value store.
 * - Web: uses window.localStorage (available in all browsers)
 * - Native: uses expo-file-system (bundled with Expo)
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

function nativePath(key: string) {
  return (FileSystem.documentDirectory ?? "") + "sandrapp_" + key + ".txt";
}

export async function saveItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch {}
  } else {
    await FileSystem.writeAsStringAsync(nativePath(key), value);
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  } else {
    try {
      return await FileSystem.readAsStringAsync(nativePath(key));
    } catch {
      return null;
    }
  }
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch {}
  } else {
    try { await FileSystem.deleteAsync(nativePath(key), { idempotent: true }); }
    catch {}
  }
}

/** Key used to persist the logged-in user's profile snapshot. */
export const SESSION_KEY = "session_user";
