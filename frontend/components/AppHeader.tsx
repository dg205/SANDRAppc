import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

// The logo and name across the top of the main tabs, with a shortcut to the
// Profile tab on the right.
export default function AppHeader() {
  return (
    <View style={styles.topBar}>
      <View style={styles.brand}>
        <Image
          source={require("../assets/logo-mark.png")}
          style={styles.brandIcon}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Text style={styles.brandName} accessibilityRole="header">
          SANDRAPP
        </Text>
      </View>
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() =>
          router.replace({ pathname: "/profile/ProfileSummary", params: { from: "tab" } })
        }
        accessibilityRole="button"
        accessibilityLabel="My profile"
      >
        <Ionicons name="person-outline" size={20} color="#2F80ED" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 40, height: 40 },
  brandName: { fontSize: 20, fontWeight: "800", color: "#1A1A2E", letterSpacing: 1 },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
