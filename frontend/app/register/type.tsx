import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useProfile, type UserType } from "../../utils/ProfileContext";

export default function RegistrationType() {
  const router = useRouter();
  const { updateProfile } = useProfile();

  const handleSelect = (type: UserType) => {
    updateProfile({ userType: type });
    router.push("/profile/age");
  };

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.card}>
        <Text style={styles.title}>Who are you?</Text>

        <TouchableOpacity style={styles.typeCard} onPress={() => handleSelect("senior")}>
          <Text style={styles.emoji}>🧓</Text>
          <Text style={styles.typeTitle}>I'm a Senior (65+)</Text>
          <Text style={styles.typeDesc}>Looking for a young companion for friendship & support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.typeCard} onPress={() => handleSelect("companion")}>
          <Text style={styles.emoji}>🙋</Text>
          <Text style={styles.typeTitle}>I'm a Young Companion (18–45)</Text>
          <Text style={styles.typeDesc}>Looking to connect with and support an older adult</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          We'll match seniors with young companions for meaningful intergenerational connections.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    paddingHorizontal: 20,
    paddingTop: 60,
    alignItems: "center",
  },

  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },

  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingVertical: 25,
    paddingHorizontal: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },

  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 25,
    color: "#1A1A1A",
  },

  typeCard: {
    width: "90%",
    backgroundColor: "#F2F6FF",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    marginBottom: 15,
    alignItems: "center",
  },

  emoji: {
    fontSize: 32,
    marginBottom: 6,
  },

  typeTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
    textAlign: "center",
  },

  typeDesc: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
  },

  backButton: {
    width: "90%",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    alignItems: "center",
  },

  backButtonText: {
    fontSize: 18,
    color: "#1A1A1A",
  },

  footer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#D9E8FF",
    borderRadius: 12,
    width: "100%",
  },

  footerText: {
    textAlign: "center",
    color: "#1A1A1A",
    fontSize: 14,
  },
});
