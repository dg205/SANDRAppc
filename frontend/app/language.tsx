import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";

export default function Language() {
  return (
    <View style={styles.container}>
      <Image source={require("../assets/logo.png")} style={styles.logo} />

      <Text style={styles.title}>Welcome to the Sandrapp Survey</Text>
      <Text style={styles.subtitle}>
        Connecting hearts across generations 💙
      </Text>

      <View style={styles.box}>
        <Text style={styles.question}>
          We’d love to learn more about you before getting started.
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push("/profile/age")}
        >
          <Text style={styles.buttonText}>Begin Survey</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 40,
  },

  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
  },

  subtitle: {
    color: "#4B6FA5",
    marginBottom: 20,
    textAlign: "center",
  },

  box: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 20,
    elevation: 3,
  },

  question: {
    textAlign: "center",
    fontSize: 18,
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#4B6FA5",
    padding: 15,
    borderRadius: 12,
  },

  buttonText: {
    fontSize: 18,
    textAlign: "center",
    color: "#fff",
    fontWeight: "600",
  },
});
