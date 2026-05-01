import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";

export default function Welcome() {
  return (
    <View style={styles.container}>
      {/* Logo */}
      <Image source={require("../assets/logo.png")} style={styles.logo} />

      {/* Main card */}
      <View style={styles.card}>
        <Text style={styles.title}>Welcome to Sandrapp 👋</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.buttonText}>🔐 Login</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/register/type")}
        >
          <Text style={styles.buttonText}>✨ Sign Up</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.push("/language")}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Footer message */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          If you received an email with your username and password, please Login.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    
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
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 20,
    color: "#1A1A1A",
    textAlign: "center",
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
});
