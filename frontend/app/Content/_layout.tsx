import { Stack } from "expo-router";

// ProfileProvider lives in the root _layout.tsx — no nested provider needed here.
export default function ContentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
