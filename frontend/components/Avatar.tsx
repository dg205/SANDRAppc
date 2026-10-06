import React from "react";
import { Image, Text, View, StyleSheet } from "react-native";

// A person's profile photo, or the first letter of their name when they
// haven't added one.
export default function Avatar({
  name,
  photoUrl,
  size = 44,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[styles.photo, shape]}
        accessibilityLabel={`Photo of ${name}`}
      />
    );
  }

  return (
    <View style={[styles.initialWrap, shape]}>
      <Text style={[styles.initial, { fontSize: size * 0.45 }]}>
        {(name || "?").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: "#DDE3ED" },
  initialWrap: {
    backgroundColor: "#E3F6EA",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontWeight: "700", color: "#27AE60" },
});
