// app/_layout.tsx
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProfileProvider } from "../utils/ProfileContext";
import { AuthProvider } from "../utils/AuthContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ProfileProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
