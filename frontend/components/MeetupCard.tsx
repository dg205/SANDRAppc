import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import {
  Meetup,
  confirmMeetup,
  describeMeetup,
  updateMeetup,
} from "../utils/api";
import { DAYS, PLACE_IDEAS, TIMES } from "../utils/schedule";

// The meetup plan at the top of a chat: shows it, lets the other person
// confirm it, lets either person suggest a change, and shares it with family.
export default function MeetupCard({
  connectionId,
  meetup,
  me,
  otherName,
  onChange,
}: {
  connectionId: number;
  meetup: Meetup;
  me: string;
  otherName: string;
  onChange: (next: Meetup) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(meetup.day);
  const [time, setTime] = useState(meetup.time);
  const [place, setPlace] = useState(meetup.place);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const confirmed = meetup.status === "confirmed";
  // Whether I made the current suggestion. The server says by id; the name
  // check is for an older server.
  const mine = meetup.updated_by_me ?? meetup.updated_by === me;
  const plan = describeMeetup(meetup);

  const run = async (action: () => Promise<Meetup>) => {
    setBusy(true);
    setError("");
    try {
      onChange(await action());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openEditor = () => {
    setDay(meetup.day);
    setTime(meetup.time);
    setPlace(meetup.place);
    setError("");
    setEditing(true);
  };

  const share = async () => {
    setNote("");
    const where = meetup.place ? ` Place: ${meetup.place}.` : "";
    try {
      await Share.share({
        message:
          `I'm meeting ${otherName} from Sandrapp on ${meetup.day} at ${meetup.time}.${where} ` +
          "I'll check in with you afterwards.",
      });
    } catch {
      setNote("Sharing isn't available here.");
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Meetup plan</Text>
        <Text style={[styles.status, confirmed ? styles.statusOk : styles.statusWaiting]}>
          {confirmed ? "✓ Confirmed" : mine ? `Waiting for ${otherName}` : "Suggested"}
        </Text>
      </View>
      <Text style={styles.plan}>{plan}</Text>
      {!meetup.place && <Text style={styles.hint}>No place yet. Tap Change to add one.</Text>}

      <View style={styles.actions}>
        {!confirmed && !mine && (
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, busy && styles.busy]}
            disabled={busy}
            onPress={() => run(() => confirmMeetup(connectionId))}
          >
            <Text style={styles.btnPrimaryText}>Confirm</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.btn} onPress={openEditor} hitSlop={8}>
          <Text style={styles.btnText}>Change</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={share} hitSlop={8}>
          <Text style={styles.btnText}>Share with family</Text>
        </TouchableOpacity>
      </View>
      {error !== "" && !editing && <Text style={styles.error}>{error}</Text>}
      {note !== "" && <Text style={styles.hint}>{note}</Text>}
      <Text style={styles.safety}>
        Meet somewhere public for the first time, and let someone you trust know your plans.
      </Text>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={() => setEditing(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Suggest a meetup</Text>
              <Text style={styles.sheetHint}>
                {otherName} will be asked to confirm your suggestion.
              </Text>

              <Text style={styles.fieldLabel}>Day</Text>
              <View style={styles.chips}>
                {DAYS.map((d) => (
                  <Chip key={d} label={d} on={day === d} onPress={() => setDay(d)} />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Time</Text>
              <View style={styles.chips}>
                {TIMES.map((t) => (
                  <Chip key={t} label={t} on={time === t} onPress={() => setTime(t)} />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Place</Text>
              <View style={styles.chips}>
                {PLACE_IDEAS.map((p) => (
                  <Chip key={p} label={p} on={place === p} onPress={() => setPlace(p)} />
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={place}
                onChangeText={setPlace}
                placeholder="Or type a place, e.g. Decatur Library"
                placeholderTextColor="#999"
                maxLength={120}
              />

              {error !== "" && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                style={[styles.saveBtn, (busy || !day || !time) && styles.busy]}
                disabled={busy || !day || !time}
                onPress={() =>
                  run(() => updateMeetup(connectionId, { day, time, place: place.trim() }))
                }
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Send Suggestion</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} disabled={busy} onPress={() => setEditing(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE3ED",
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  status: { fontSize: 13, fontWeight: "700" },
  statusOk: { color: "#27AE60" },
  statusWaiting: { color: "#F39C12" },
  plan: { fontSize: 18, fontWeight: "700", color: "#1A1A2E", marginTop: 4 },
  hint: { fontSize: 13, color: "#888", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  btn: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#2F80ED",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnText: { color: "#2F80ED", fontSize: 15, fontWeight: "600" },
  btnPrimary: { backgroundColor: "#27AE60", borderColor: "#27AE60" },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  busy: { opacity: 0.5 },
  error: { fontSize: 14, color: "#E74C3C", marginTop: 8 },
  safety: { fontSize: 12, color: "#888", marginTop: 8, lineHeight: 17 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  sheetTitle: { fontSize: 22, fontWeight: "800", color: "#1A1A2E" },
  sheetHint: { fontSize: 15, color: "#555", marginTop: 4, marginBottom: 12 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#B0C8F0",
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#2F80ED", borderColor: "#2F80ED" },
  chipText: { fontSize: 15, color: "#2F80ED" },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  input: {
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    padding: 14,
    fontSize: 16,
    color: "#1A1A2E",
    marginTop: 10,
  },
  saveBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 18,
  },
  saveText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelText: { color: "#2F80ED", fontSize: 16, fontWeight: "600" },
});
