import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";
import { useProfile } from "./profileContext";


export default function Age() {
  const { updateProfile } = useProfile();
  const [age, setAge] = useState("");

  const handleNext = () => {
    const parsed = parseInt(age, 10);
    if (!isNaN(parsed)) {
      setProfile({ age: String(parsed) });
    }
    router.push("/profile/location");
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <Text style={styles.header}>Let's Set Up Your Profile</Text>
      <Text style={styles.subheader}>We're excited to help you make new connections</Text>

      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      <View style={styles.card}>
        <Text style={styles.question}>Question 1 of 9: Your Age</Text>
        <Text style={styles.title}>How old are you?</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your age"
          keyboardType="numeric"
          value={age}
          onChangeText={setAge}
        />

        <TouchableOpacity style={styles.next} onPress={handleNext}>
          <Text style={styles.nextText}>Next →</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.helper}>💡 Don't worry - you can always change these answers later</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", backgroundColor: "#E5EEFF", paddingTop: 40 },
  logo: { width: 80, height: 80 },
  header: { fontSize: 20, marginTop: 10, fontWeight: "600" },
  subheader: { fontSize: 14, color: "#555", marginBottom: 10 },
  progressBar: {
    width: "80%",
    backgroundColor: "#DADFF0",
    height: 6,
    borderRadius: 10,
    marginVertical: 10,
  },
  progressFill: {
    width: "12%",
    backgroundColor: "#3A74F3",
    height: 6,
    borderRadius: 10,
  },
  card: {
    backgroundColor: "#fff",
    width: "90%",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  question: { fontSize: 16, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 10 },
  input: {
    width: "100%",
    backgroundColor: "#F1F4FF",
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
  },
  next: {
    backgroundColor: "#3A74F3",
    padding: 14,
    borderRadius: 12,
    width: "100%",
  },
  nextText: { textAlign: "center", color: "#fff", fontSize: 18 },
  helper: { marginTop: 15, color: "#333", textAlign: "center", width: "85%" },
});
