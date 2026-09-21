import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { ChatMessage, getMessages, sendMessage } from "../../utils/api";

const POLL_MS = 5000;
const MAX_LENGTH = 2000;

// Server timestamps are UTC with no zone marker, and Hermes only reliably
// parses up to millisecond precision.
function formatTime(createdAt: string): string {
  const iso = createdAt.replace(" ", "T").replace(/(\.\d{3})\d*$/, "$1") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Chat() {
  const { connectionId, otherUserName, userName } = useLocalSearchParams<{
    connectionId?: string;
    otherUserName?: string;
    userName?: string;
  }>();

  const connId = Number(connectionId);
  const me = (userName ?? "").trim();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const newestId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!connId || !me) {
      setError("This chat is missing some details. Please go back and try again.");
      setLoading(false);
      return;
    }
    try {
      const fresh = await getMessages(connId, me, newestId.current);
      if (fresh.length > 0) {
        newestId.current = Math.max(newestId.current, fresh[fresh.length - 1].id);
        // A poll and a send can overlap, so skip anything we already have.
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
        });
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connId, me]);

  // Poll only while this screen is in view.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load])
  );

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    try {
      await sendMessage(connId, me, text);
      setDraft("");
      // Re-fetch instead of appending locally, so a message the other person
      // sent a moment earlier is not skipped over.
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerName} numberOfLines={1}>
          {otherUserName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {loading ? (
            <ActivityIndicator color="#2F80ED" style={{ marginTop: 40 }} />
          ) : messages.length === 0 ? (
            error === "" && (
              <Text style={styles.emptyText}>
                No messages yet. Say hello to {otherUserName}!
              </Text>
            )
          ) : (
            messages.map((m) => {
              const mine = m.sender_name === me;
              return (
                <View
                  key={m.id}
                  style={[styles.bubbleWrap, mine ? styles.wrapMine : styles.wrapTheirs]}
                >
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={mine ? styles.textMine : styles.textTheirs}>{m.body}</Text>
                  </View>
                  <Text style={styles.time}>{formatTime(m.created_at)}</Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {error !== "" && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message"
            placeholderTextColor="#999"
            value={draft}
            onChangeText={setDraft}
            maxLength={MAX_LENGTH}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE3ED",
  },
  backText: { fontSize: 16, color: "#2F80ED", fontWeight: "600", width: 70 },
  headerName: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A2E",
  },
  headerSpacer: { width: 70 },

  messages: { padding: 16, paddingBottom: 8, flexGrow: 1 },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 40,
    lineHeight: 24,
  },

  bubbleWrap: { marginBottom: 10, maxWidth: "80%" },
  wrapMine: { alignSelf: "flex-end", alignItems: "flex-end" },
  wrapTheirs: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: "#2F80ED", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  textMine: { color: "#fff", fontSize: 16, lineHeight: 22 },
  textTheirs: { color: "#1A1A2E", fontSize: 16, lineHeight: 22 },
  time: { fontSize: 11, color: "#888", marginTop: 3, marginHorizontal: 4 },

  errorText: {
    fontSize: 14,
    color: "#E74C3C",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#DDE3ED",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: "#F5F9FF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: "#1A1A2E",
  },
  sendBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 76,
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#9CA3AF" },
  sendText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
