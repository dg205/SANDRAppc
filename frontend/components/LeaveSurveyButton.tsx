import React, { useEffect, useState } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { getMyProfile } from "../utils/api";
import { useAuth } from "../utils/AuthContext";
import { confirmAction } from "../utils/confirm";
import { removeItem, SESSION_KEY } from "../utils/storage";

// Only "yes" is remembered: once someone has a profile they keep it, but a
// new user who finishes the survey should start seeing the button.
let knownToHaveProfile = false;

// The dashboard calls this once it has loaded the user's profile, so the
// button is already there when they open the survey from it.
export function markHasProfile() {
  knownToHaveProfile = true;
}

// A way out of the survey. Someone retaking it goes back to their
// dashboard. Someone who just signed up has no dashboard yet, so they go
// back to sign up, which means signing out of the account they just made.
export default function LeaveSurveyButton({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const { signOut } = useAuth();
  const [mode, setMode] = useState<"unknown" | "dashboard" | "signup">(
    knownToHaveProfile ? "dashboard" : "unknown"
  );

  useEffect(() => {
    if (knownToHaveProfile) return;
    getMyProfile()
      .then((profile) => {
        if (profile) knownToHaveProfile = true;
        setMode(profile ? "dashboard" : "signup");
      })
      // Unknown (e.g. offline): show nothing rather than guess.
      .catch(() => {});
  }, []);

  if (mode === "unknown") return null;

  const leave = async () => {
    if (mode === "dashboard") {
      const confirmed = await confirmAction(
        "Leave the survey?",
        "The answers you've given so far won't be saved. Your current profile stays the same.",
        "Leave"
      );
      if (confirmed) router.dismissTo("/home");
      return;
    }

    const confirmed = await confirmAction(
      "Go back to sign up?",
      "You'll be signed out. Your account is already created, so next time you can log in with the same email and password.",
      "Go Back"
    );
    if (!confirmed) return;
    await removeItem(SESSION_KEY);
    await signOut();
    router.replace("/signup");
  };

  return (
    <TouchableOpacity style={[styles.button, style]} onPress={leave} hitSlop={12}>
      <Text style={styles.text}>
        {mode === "dashboard" ? "← Back to Dashboard" : "← Back to Sign Up"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 8 },
  text: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },
});
