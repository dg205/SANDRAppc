import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { BASE_URL } from "../../utils/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMES = ["Morning", "Afternoon", "Evening"];

export default function ConnectRequest() {
  const { matchName, fromUserName } = useLocalSearchParams<{
    matchName: string;
    fromUserName?: string;
  }>();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = !!selectedDay && !!selectedTime;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch(`${BASE_URL}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_user_name: fromUserName ?? "Unknown",
          to_user_name: matchName,
          proposed_day: selectedDay,
          proposed_time: selectedTime,
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Request failed (${res.status}): ${text}`);
      }

      Alert.alert(
        "Request Sent!",
        `Your connection request has been sent to ${matchName}. They will see it as pending.`,
        [{ text: "OK", onPress: () => router.push("/home") }]
      );
    } catch (err: any) {
      Alert.alert("Could not send request", err?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Request to Connect</Text>
        <Text style={styles.subtitle}>
          Suggest a day and time to meet with{" "}
          <Text style={styles.matchNameHighlight}>{matchName}</Text>
        </Text>

        {/* Day selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What day works best for you?</Text>
          <View style={styles.optionGrid}>
            {DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                style={[
                  styles.optionBtn,
                  selectedDay === day && styles.optionBtnActive,
                ]}
                onPress={() => setSelectedDay(day)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedDay === day && styles.optionTextActive,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Time selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What time of day?</Text>
          <View style={styles.optionRow}>
            {TIMES.map((time) => (
              <TouchableOpacity
                key={time}
                style={[
                  styles.timeBtn,
                  selectedTime === time && styles.optionBtnActive,
                ]}
                onPress={() => setSelectedTime(time)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selectedTime === time && styles.optionTextActive,
                  ]}
                >
                  {time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Optional message */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Add a message{" "}
            <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder={`Say hello to ${matchName}…`}
            placeholderTextColor="#AAA"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Summary */}
        {canSend && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              You're suggesting{" "}
              <Text style={styles.summaryBold}>{selectedDay}</Text>{" "}
              <Text style={styles.summaryBold}>{selectedTime}</Text> to{" "}
              <Text style={styles.summaryBold}>{matchName}</Text>
            </Text>
          </View>
        )}

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Send Request</Text>
          )}
        </TouchableOpacity>

        {!canSend && (
          <Text style={styles.hint}>
            Please select a day and time before sending.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EAF3FF" },
  scroll: { padding: 20, paddingBottom: 48 },

  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },

  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A2E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#555",
    marginBottom: 24,
    lineHeight: 22,
  },
  matchNameHighlight: {
    color: "#2F80ED",
    fontWeight: "700",
  },

  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 14,
  },
  optional: { fontSize: 13, color: "#999", fontWeight: "400" },

  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionRow: { flexDirection: "row", gap: 10 },

  optionBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#F5F9FF",
  },
  timeBtn: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#F5F9FF",
  },
  optionBtnActive: {
    backgroundColor: "#2F80ED",
    borderColor: "#2F80ED",
  },
  optionText: { fontSize: 15, color: "#2F80ED", fontWeight: "500" },
  optionTextActive: { color: "#fff", fontWeight: "700" },

  messageInput: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    padding: 14,
    fontSize: 15,
    color: "#1A1A2E",
    minHeight: 100,
  },

  summaryCard: {
    backgroundColor: "#EEF4FF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#B0C8F0",
  },
  summaryText: { fontSize: 15, color: "#444", lineHeight: 22 },
  summaryBold: { fontWeight: "700", color: "#1A1A2E" },

  sendBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 12,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },

  hint: {
    textAlign: "center",
    fontSize: 14,
    color: "#999",
  },
});
