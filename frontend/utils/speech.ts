// Read text aloud with the phone's voice. expo-speech is only loaded once
// we know this app build has its native part (see hasNativeModule).
import { hasNativeModule } from "./nativeModules";

type SpeechModule = typeof import("expo-speech");

let speech: SpeechModule | null = null;

async function load(): Promise<SpeechModule | null> {
  if (speech) return speech;
  if (!hasNativeModule("ExpoSpeech")) return null;
  try {
    speech = await import("expo-speech");
    return speech;
  } catch {
    return null;
  }
}

// Returns false if this build can't speak.
export async function readAloud(text: string): Promise<boolean> {
  const s = await load();
  if (!s) return false;
  try {
    s.stop();
    // A little slower than default, which is easier to follow.
    s.speak(text, { rate: 0.9 });
    return true;
  } catch {
    return false;
  }
}

export function stopReading(): void {
  try {
    speech?.stop();
  } catch {}
}
