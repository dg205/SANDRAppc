import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { sendConnectRequest } from "../../utils/api";
import { getItem, SESSION_KEY } from "../../utils/storage";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function ConnectRequest() {
  const { matchName, fromUserName } = useLocalSearchParams<{
    matchName?: string;
    fromUserName?: string;
  }>();

  const [fromUser, setFromUser] = useState((fromUserName ?? "").trim());
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // The sender's name normally arrives as a param; fall back to the saved session.
  useEffect(() => {
    if (fromUser) return;
    getItem(SESSION_KEY).then((raw) => {
      try {
        const session = raw ? JSON.parse(raw) : null;
        if (session?.name) setFromUser(session.name);
      } catch {}
    });
  }, []);

  const canSend = !!fromUser && !!matchName && !!day && !!time.trim() && !sending;

  const handleSend = async () => {
    setSending(true);
    setError("");
    try {
      await sendConnectRequest({
        from_user_name: fromUser,
        to_user_name: matchName ?? "",
        proposed_day: day,
        proposed_time: time.trim(),
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  };

  const goToRequests = () =>
    router.replace({
      pathname: "/profile/Requests",
      params: { userName: fromUser },
    });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {sent ? (
          <View style={styles.card}>
            <Text style={styles.title}>Request sent!</Text>
            <Text style={styles.subtitle}>
              We let {matchName} know. You'll see their answer under My Requests.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={goToRequests}>
              <Text style={styles.primaryBtnText}>View My Requests</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>Connect with {matchName}</Text>
            <Text style={styles.subtitle}>
              Suggest a day and time that works for you.
            </Text>

            <Text style={styles.label}>Day</Text>
            <View style={styles.chips}>
              {DAYS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, day === d && styles.chipActive]}
                  onPress={() => setDay(d)}
                >
                  <Text style={[styles.chipText, day === d && styles.chipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Time</Text>
            <TextInput
              style={styles.input}
              placeholder="For example: 2:00 PM"
              placeholderTextColor="#999"
              value={time}
              onChangeText={setTime}
            />

            <Text style={styles.label}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              placeholder={`Say hello to ${matchName ?? "them"}...`}
              placeholderTextColor="#999"
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
            />

            {error !== "" && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.primaryBtn, !canSend && styles.primaryBtnDisabled]}
              onPress={handleSend}
              disabled={!canSend}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },
  scroll: { padding: 20, paddingBottom: 48 },

  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#1A1A2E", marginBottom: 6 },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 20, lineHeight: 22 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#2F80ED", borderColor: "#2F80ED" },
  chipText: { fontSize: 14, color: "#2F80ED" },
  chipTextActive: { color: "#fff", fontWeight: "600" },

  input: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    padding: 14,
    fontSize: 16,
    color: "#1A1A2E",
    marginBottom: 20,
  },
  messageInput: { minHeight: 90 },

  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
    marginBottom: 12,
  },

  primaryBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#9CA3AF" },
  primaryBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
