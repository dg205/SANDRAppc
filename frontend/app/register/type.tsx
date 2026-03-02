import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function RegistrationType() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.card}>
        <Text style={styles.title}>I am an</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/register/individual")}
        >
          <Text style={styles.buttonText}>Individual</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/register/family")}
        >
          <Text style={styles.buttonText}>Family Registration</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          If you are an older adult, please ask us to change the language for you.
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

  button: {
    width: "90%",
    backgroundColor: "#F2F6FF",
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    marginBottom: 15,
    alignItems: "center",
  },

  buttonText: {
    fontSize: 18,
    color: "#1A1A1A",
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
