import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useProfile } from "../../utils/ProfileContext";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Lifestyle() {
  const { updateProfile } = useProfile();
  const [helpWith, setHelpWith] = useState("");
  const [talkPrefs, setTalkPrefs] = useState("");
  const [goals, setGoals] = useState("");
  const [family, setFamily] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const toggleDay = (day: string) => {
    const lower = day.toLowerCase();
    setSelectedDays((prev) =>
      prev.includes(lower) ? prev.filter((d) => d !== lower) : [...prev, lower]
    );
  };

  const handleNext = () => {
    const parse = (s: string) =>
      s.split(",").map((v) => v.trim().toLowerCase()).filter((v) => v.length > 0);

    updateProfile({
      helpWith: parse(helpWith),
      talkPreferences: parse(talkPrefs),
      connectionGoals: parse(goals),
      familySituation: family.trim(),
      availableDays: selectedDays,
    });
    router.push("/profile/bio");
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.container}>
        <Image source={require("../../assets/logo.png")} style={styles.logo} />

        <Text style={styles.header}>Let's Set Up Your Profile</Text>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: "88%" }]} />
        </View>

        <Text style={styles.questionNumber}>Question 8 of 9: Lifestyle</Text>

        <View style={styles.card}>
          <Text style={styles.title}>A few more things about you</Text>

          <Text style={styles.label}>What do you need help with?</Text>
          <TextInput
            value={helpWith}
            onChangeText={setHelpWith}
            placeholder="e.g. rides, errands, cooking..."
            style={styles.input}
          />

          <Text style={styles.label}>How do you prefer to talk?</Text>
          <TextInput
            value={talkPrefs}
            onChangeText={setTalkPrefs}
            placeholder="e.g. phone, in-person, video call..."
            style={styles.input}
          />

          <Text style={styles.label}>What are you looking for?</Text>
          <TextInput
            value={goals}
            onChangeText={setGoals}
            placeholder="e.g. friendship, walking buddy, book club..."
            style={styles.input}
          />

          <Text style={styles.label}>Family situation</Text>
          <TextInput
            value={family}
            onChangeText={setFamily}
            placeholder="e.g. lives alone, lives with family, widowed..."
            style={styles.input}
          />

          <Text style={styles.label}>Available days</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => {
              const active = selectedDays.includes(day.toLowerCase());
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.dayText, active && styles.dayTextActive]}>
                    {day.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.hint}>Separate items with commas</Text>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  container: {
    flex: 1,
    backgroundColor: "#E4F0FF",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
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
    marginBottom: 14,
    fontSize: 16,
  },
  hint: { fontSize: 13, color: "#888", marginBottom: 16 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16, width: "100%" },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#F2F6FF",
    borderWidth: 1,
    borderColor: "#8AB4FF",
  },
  dayChipActive: { backgroundColor: "#8AB4FF" },
  dayText: { fontSize: 14, color: "#333" },
  dayTextActive: { color: "#fff", fontWeight: "600" },
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
