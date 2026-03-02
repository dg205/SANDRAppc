import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";
import { useProfile } from "../../utils/ProfileContext";

export default function Culture() {
  const { updateProfile } = useProfile();
  const [background, setBackground] = useState("");
  const [foods, setFoods] = useState("");

  const handleNext = () => {
    const foodList = foods
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    updateProfile({ culturalBackground: background.trim(), favoriteFood: foodList });
    router.push("/profile/lifestyle");
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <Text style={styles.header}>Let's Set Up Your Profile</Text>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: "77%" }]} />
      </View>

      <Text style={styles.questionNumber}>Question 7 of 9: Culture & Food</Text>

      <View style={styles.card}>
        <Text style={styles.title}>Tell us about your background</Text>

        <Text style={styles.label}>Cultural background</Text>
        <TextInput
          value={background}
          onChangeText={setBackground}
          placeholder="e.g. Mexican, Korean, American..."
          style={styles.input}
        />

        <Text style={styles.label}>Favorite foods</Text>
        <TextInput
          value={foods}
          onChangeText={setFoods}
          placeholder="e.g. Mexican, Italian, BBQ..."
          style={styles.input}
        />
        <Text style={styles.hint}>Separate with commas</Text>

        <View style={styles.row}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  logo: { width: 80, height: 80, marginBottom: 20, resizeMode: "contain" },
  header: { fontSize: 22, fontWeight: "600", marginBottom: 10, textAlign: "center" },
  progressContainer: {
    width: "100%",
    height: 10,
    backgroundColor: "#D0E2FF",
    borderRadius: 10,
    marginVertical: 15,
  },
  progressBar: { height: "100%", backgroundColor: "#8AB4FF", borderRadius: 10 },
  questionNumber: { fontSize: 16, marginBottom: 10, color: "#333" },
  card: {
    backgroundColor: "#fff",
    width: "100%",
    padding: 20,
    borderRadius: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 15, textAlign: "center" },
  label: { alignSelf: "flex-start", fontSize: 15, fontWeight: "500", marginBottom: 6, color: "#333" },
  input: {
    width: "100%",
    backgroundColor: "#F2F6FF",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    marginBottom: 12,
    fontSize: 16,
  },
  hint: { fontSize: 13, color: "#888", marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  backBtn: {
    flex: 1,
    marginRight: 10,
    backgroundColor: "#E4E9F7",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  nextBtn: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#F2F6FF",
    paddingVertical: 12,
    borderRadius: 10,
    borderColor: "#8AB4FF",
    borderWidth: 1,
    alignItems: "center",
  },
  backText: { fontSize: 16, color: "#333" },
  nextText: { fontSize: 16, color: "#333" },
});
