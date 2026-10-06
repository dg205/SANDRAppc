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
import { confirmAction } from "../utils/confirm";

// Only "yes" is remembered: once someone has a profile they keep it, but a
// new user who finishes the survey should start seeing the button.
let knownToHaveProfile = false;

// The dashboard calls this once it has loaded the user's profile, so the
// button is already there when they open the survey from it.
export function markHasProfile() {
  knownToHaveProfile = true;
}

// "Back to Dashboard" for people retaking the survey from the dashboard.
// Hidden for new users, who have no dashboard to go back to yet.
export default function LeaveSurveyButton({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const [show, setShow] = useState(knownToHaveProfile);

  useEffect(() => {
    if (knownToHaveProfile) return;
    getMyProfile()
      .then((profile) => {
        if (profile) {
          knownToHaveProfile = true;
          setShow(true);
        }
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  const leave = async () => {
    const confirmed = await confirmAction(
      "Leave the survey?",
      "The answers you've given so far won't be saved. Your current profile stays the same.",
      "Leave"
    );
    if (confirmed) router.dismissTo("/home");
  };

  return (
    <TouchableOpacity style={[styles.button, style]} onPress={leave}>
      <Text style={styles.text}>← Back to Dashboard</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 8 },
  text: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },
});
