import { Alert, Platform } from "react-native";

// Ask a yes/no question. Alert does nothing on web, so fall back to the
// browser's confirm there.
export async function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === "web") {
    return (window as any).confirm(`${title}\n\n${message}`) as boolean;
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}
