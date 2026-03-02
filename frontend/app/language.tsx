import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";

export default function Language() {
  return (
    <View style={styles.container}>
      <Image source={require("../assets/logo.png")} style={styles.logo} />

      <Text style={styles.title}>Welcome to Sandrapp</Text>
      <Text style={styles.subtitle}>Connecting hearts across generations 💙</Text>

      <View style={styles.box}>
        <Text style={styles.question}>What Language do you speak? 🌍</Text>

        {["English", "Espanol", "Russian"].map((lang) => (
          <TouchableOpacity
            style={styles.button}
            key={lang}
            onPress={() => router.push("/welcome")}
          >
            <Text style={styles.buttonText}>{lang}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", paddingTop: 40 },
  logo: { width: 120, height: 120, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "bold" },
  subtitle: { color: "#4B6FA5", marginBottom: 20 },
  box: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 20,
    elevation: 3,
  },
  question: { textAlign: "center", fontSize: 18, marginBottom: 20 },
  button: {
    backgroundColor: "#eef4ff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonText: { fontSize: 18, textAlign: "center" },
});
