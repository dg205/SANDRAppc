// app/_layout.tsx
import { Stack } from "expo-router";
import { ProfileProvider } from "../utils/ProfileContext";

export default function RootLayout() {
  return (
    <ProfileProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ProfileProvider>
  );
}
