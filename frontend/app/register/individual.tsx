import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";

export default function Account() {
  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>

        <Text style={styles.label}>Email Address</Text>
        <TextInput style={styles.input} placeholder="your.email@example.com" />

        <Text style={styles.label}>Create Password</Text>
        <TextInput style={styles.input} placeholder="Create a password" secureTextEntry />

        <Text style={styles.label}>Confirm Password</Text>
        <TextInput style={styles.input} placeholder="Confirm your password" secureTextEntry />

        <Text style={styles.helper}>
          Your email address will be used to sign in to your account
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.next} onPress={() => router.push("/register/family")}>
          <Text style={styles.nextText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5EEFF", alignItems: "center", paddingTop: 50 },
  logo: { width: 80, height: 80, marginBottom: 20 },
  card: {
    backgroundColor: "#fff",
    width: "90%",
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  label: { fontSize: 16, fontWeight: "500", marginTop: 10 },
  input: {
    backgroundColor: "#F1F4FF",
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    fontSize: 16,
  },
  helper: {
    backgroundColor: "#D8E6FF",
    padding: 12,
    borderRadius: 12,
    textAlign: "center",
    marginTop: 20,
    color: "#333",
  },
  footer: { flexDirection: "row", width: "90%", marginTop: 10 },
  back: {
    flex: 1,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginRight: 8,
  },
  next: {
    flex: 1,
    padding: 14,
    backgroundColor: "#3A74F3",
    borderRadius: 12,
    marginLeft: 8,
  },
  backText: { textAlign: "center", fontSize: 18, color: "#3A74F3" },
  nextText: { textAlign: "center", fontSize: 18, color: "#fff" },
});
