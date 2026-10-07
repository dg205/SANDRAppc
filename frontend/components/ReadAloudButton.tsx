import React, { useEffect, useState } from "react";
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { readAloud, stopReading } from "../utils/speech";

// "🔊 Read question aloud" for the survey. Stops reading when the screen
// is left, so the next question doesn't talk over the last one.
export default function ReadAloudButton({
  text,
  label = "🔊 Read question aloud",
  style,
}: {
  text: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => stopReading, []);

  const speak = async () => {
    setUnavailable(!(await readAloud(text)));
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={speak}
      hitSlop={10}
      accessibilityLabel="Read the question aloud"
    >
      <Text style={styles.text}>{label}</Text>
      {unavailable && (
        <Text style={styles.note}>Reading aloud needs the latest version of the app.</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: "center", alignItems: "center", paddingVertical: 8 },
  text: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },
  note: { fontSize: 13, color: "#888", marginTop: 4, textAlign: "center" },
});
