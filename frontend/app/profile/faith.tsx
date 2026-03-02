import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from "react-native";
import { router } from "expo-router";
import { useProfile } from "../../utils/ProfileContext";

export default function Faith() {
  const { updateProfile } = useProfile();
  const [faith, setFaith] = useState("");

  const handleNext = () => {
    updateProfile({ faith: faith.trim() });
    router.push("/profile/languages");
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/logo.png")} style={styles.logo} />

      <Text style={styles.header}>Let's Set Up Your Profile</Text>

      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: "55%" }]} />
      </View>

      <Text style={styles.questionNumber}>Question 5 of 9: Your Faith</Text>

      <View style={styles.card}>
        <Text style={styles.title}>What is your religion or faith?</Text>

        <TextInput
          value={faith}
          onChangeText={setFaith}
          placeholder="e.g. Christian, Catholic, Muslim, Jewish, None..."
          style={styles.input}
        />

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
  title: { fontSize: 20, fontWeight: "600", marginBottom: 10, textAlign: "center" },
  input: {
    width: "100%",
    backgroundColor: "#F2F6FF",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#8AB4FF",
    marginBottom: 20,
    fontSize: 16,
  },
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
