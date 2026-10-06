import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  REPORT_REASONS,
  blockUser,
  removeConnection,
  reportUser,
} from "../utils/api";

type Step = "menu" | "remove" | "block" | "report" | "done";

// Remove / block / report options for one connection, shown as a bottom
// sheet. A built-in modal rather than Alert, since Alert only allows three
// buttons on Android and does nothing on web.
export default function SafetySheet({
  visible,
  otherName,
  connectionId,
  onClose,
  onFinished,
}: {
  visible: boolean;
  otherName: string;
  connectionId: number;
  onClose: () => void;
  // Called after the connection has ended, once the user taps OK.
  onFinished: () => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneMessage, setDoneMessage] = useState("");

  const reset = () => {
    setStep("menu");
    setReason("");
    setDetails("");
    setError("");
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setDoneMessage(message);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    reset();
    onFinished();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {step === "menu" && (
              <>
                <Text style={styles.title}>{otherName}</Text>
                <Option
                  label="Remove connection"
                  detail="You'll stop chatting. Either of you can connect again later."
                  onPress={() => setStep("remove")}
                />
                <Option
                  label={`Block ${otherName}`}
                  detail="They won't be able to contact you or see you in their matches."
                  onPress={() => setStep("block")}
                />
                <Option
                  label={`Report ${otherName}`}
                  detail="Tell us what happened. We'll also block them for you."
                  danger
                  onPress={() => setStep("report")}
                />
                <TouchableOpacity style={styles.secondaryBtn} onPress={close}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {(step === "remove" || step === "block") && (
              <>
                <Text style={styles.title}>
                  {step === "remove"
                    ? `Remove ${otherName}?`
                    : `Block ${otherName}?`}
                </Text>
                <Text style={styles.body}>
                  {step === "remove"
                    ? "Your chat will close and they'll no longer be in your connections."
                    : "Your chat will close, and neither of you will see the other in matches or be able to send a request. You can unblock them later from Edit Profile."}
                </Text>
                {error !== "" && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.dangerBtn, busy && styles.busy]}
                  disabled={busy}
                  onPress={() =>
                    step === "remove"
                      ? run(() => removeConnection(connectionId), `${otherName} has been removed from your connections.`)
                      : run(() => blockUser(otherName), `${otherName} has been blocked.`)
                  }
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.dangerText}>
                      {step === "remove" ? "Remove" : "Block"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} disabled={busy} onPress={() => setStep("menu")}>
                  <Text style={styles.secondaryText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}

            {step === "report" && (
              <>
                <Text style={styles.title}>Report {otherName}</Text>
                <Text style={styles.body}>What happened?</Text>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.reason, reason === r.value && styles.reasonActive]}
                    onPress={() => setReason(r.value)}
                  >
                    <View style={[styles.radio, reason === r.value && styles.radioActive]} />
                    <Text style={styles.reasonText}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={styles.details}
                  placeholder="Anything else we should know? (optional)"
                  placeholderTextColor="#999"
                  value={details}
                  onChangeText={setDetails}
                  maxLength={1000}
                  multiline
                />
                {error !== "" && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity
                  style={[styles.dangerBtn, (!reason || busy) && styles.busy]}
                  disabled={!reason || busy}
                  onPress={() =>
                    run(
                      () =>
                        reportUser({
                          user_name: otherName,
                          reason,
                          details: details.trim(),
                          connection_id: connectionId,
                        }),
                      `Thank you for telling us. We've received your report and blocked ${otherName}.`
                    )
                  }
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.dangerText}>Send Report</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} disabled={busy} onPress={() => setStep("menu")}>
                  <Text style={styles.secondaryText}>Go Back</Text>
                </TouchableOpacity>
              </>
            )}

            {step === "done" && (
              <>
                <Text style={styles.title}>Done</Text>
                <Text style={styles.body}>{doneMessage}</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={finish}>
                  <Text style={styles.primaryText}>OK</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Option({
  label,
  detail,
  danger,
  onPress,
}: {
  label: string;
  detail: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.option} onPress={onPress}>
      <Text style={[styles.optionLabel, danger && styles.optionDanger]}>{label}</Text>
      <Text style={styles.optionDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#1A1A2E", marginBottom: 12 },
  body: { fontSize: 16, color: "#444", lineHeight: 24, marginBottom: 16 },
  error: { fontSize: 14, color: "#E74C3C", textAlign: "center", marginBottom: 12 },

  option: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F6",
  },
  optionLabel: { fontSize: 18, fontWeight: "700", color: "#1A1A2E" },
  optionDanger: { color: "#E74C3C" },
  optionDetail: { fontSize: 14, color: "#666", marginTop: 3, lineHeight: 20 },

  reason: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE3ED",
    marginBottom: 8,
  },
  reasonActive: { borderColor: "#E74C3C", backgroundColor: "#FFF5F5" },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#B0B8C8",
  },
  radioActive: { borderColor: "#E74C3C", backgroundColor: "#E74C3C" },
  reasonText: { fontSize: 16, color: "#1A1A2E", flex: 1 },
  details: {
    minHeight: 80,
    backgroundColor: "#F5F9FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D8F0",
    padding: 12,
    fontSize: 16,
    color: "#1A1A2E",
    textAlignVertical: "top",
    marginTop: 4,
    marginBottom: 16,
  },

  primaryBtn: {
    backgroundColor: "#2F80ED",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dangerBtn: {
    backgroundColor: "#E74C3C",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  dangerText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  busy: { opacity: 0.5 },
  secondaryBtn: { paddingVertical: 14, alignItems: "center", marginTop: 6 },
  secondaryText: { color: "#2F80ED", fontSize: 16, fontWeight: "600" },
});
