import { Stack } from "expo-router";
import { ProfileProvider } from "./profileContext";

export default function ProfileLayout() {
  return (
    <ProfileProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
        }}
      />
    </ProfileProvider>
  );
}
