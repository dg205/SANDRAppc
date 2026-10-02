// app/_layout.tsx
import { Stack } from "expo-router";
import { ProfileProvider } from "../utils/ProfileContext";
import { AuthProvider } from "../utils/AuthContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ProfileProvider>
    </AuthProvider>
  );
}
