import { View, Text, TouchableOpacity, StyleSheet, Image, BackHandler } from "react-native";
import { router } from "expo-router";

export default function FinishSurvey() {
  const handleExit = () => {
    // Android app exit
    BackHandler.exitApp();

    // Web browser close attempt
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <Text style={styles.title}>Congratulations!</Text>

      <Text style={styles.subtitle}>
        You are finished.{"\n"}
        Thank you for completing the survey 💙
      </Text>

      <View style={styles.box}>
        <TouchableOpacity style={styles.button} onPress={handleExit}>
          <Text style={styles.buttonText}>Exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f8fbff",
  },

  logo: {
    width: 120,
    height: 120,
    marginBottom: 25,
  },

  title: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
    color: "#1E3A5F",
  },

  subtitle: {
    fontSize: 18,
    textAlign: "center",
    color: "#4B6FA5",
    marginBottom: 35,
    lineHeight: 28,
  },

  box: {
    width: "90%",
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 20,
    elevation: 3,
    alignItems: "center",
  },

  button: {
    backgroundColor: "#4B6FA5",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: "100%",
  },

  buttonText: {
    fontSize: 18,
    textAlign: "center",
    color: "#fff",
    fontWeight: "600",
  },
});
