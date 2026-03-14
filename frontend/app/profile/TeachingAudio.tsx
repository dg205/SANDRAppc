import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  SafeAreaView,
} from "react-native";
import * as FileSystem from "expo-file-system";
import MicrophoneRecorder from "../../components/MicrophoneRecorder";
import { router } from "expo-router";
import { useProfile } from "./profileContext";

export default function TeachingAudio() {
  const { setProfile } = useProfile();
  const [liveText, setLiveText] = useState("");
  const [recordedText, setRecordedText] = useState("");
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");

  const handleFinish = async ({
    audioUri,
    text,
    csv,
  }: {
    audioUri: string | null;
    text: string;
    csv: string;
  }) => {
    setLiveText("");
    setRecordedText(text);
    setAudioUri(audioUri);
    setCsvText(csv);
    setProfile({ teaching: text });

    if (Platform.OS !== "web") {
      await saveAudioFile(audioUri);
      await saveTranscription(text);
      await saveCSVFromTranscription(text);
    }
  };

  // ---------------------------
  // NATIVE FILE SAVING
  // ---------------------------

  const saveAudioFile = async (uri: string | null) => {
    if (!uri) return;

    const audioDir = FileSystem.documentDirectory + "audio/";
    await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });

    const fileName = `teaching_audio_${Date.now()}.m4a`;
    const dest = audioDir + fileName;

    await FileSystem.copyAsync({ from: uri, to: dest });
  };

  const saveTranscription = async (text: string) => {
    const transDir = FileSystem.documentDirectory + "transcriptions/";
    await FileSystem.makeDirectoryAsync(transDir, { intermediates: true });

    const fileName = `teaching_transcription_${Date.now()}.txt`;
    const dest = transDir + fileName;

    await FileSystem.writeAsStringAsync(dest, text);
  };

  const saveCSVFromTranscription = async (text: string) => {
    const csvDir = FileSystem.documentDirectory + "csv/";
    await FileSystem.makeDirectoryAsync(csvDir, { intermediates: true });

    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    const csvContent = ["word", ...words].join("\n");

    const fileName = `teaching_words_${Date.now()}.csv`;
    const dest = csvDir + fileName;

    await FileSystem.writeAsStringAsync(dest, csvContent);
  };

  // ---------------------------
  // WEB DOWNLOAD HELPERS
  // ---------------------------

  const downloadWebAudio = async () => {
    if (!audioUri) return;

    const response = await fetch(audioUri);
    const blob = await response.blob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teaching_audio.m4a";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadWebCSV = () => {
    if (!csvText) return;

    const blob = new Blob([csvText], { type: "text/csv" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teaching_words.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.appName}>Sandrapp</Text>

        <View style={styles.header}>
          <Text style={styles.setupTitle}>Let&apos;s Set Up Your Profile</Text>
          <Text style={styles.setupSubtitle}>
            We&apos;re excited to help you make new connections
          </Text>
        </View>

        <View style={styles.progressBarBackground}>
          <View style={styles.progressBarFill} />
        </View>

        <Text style={styles.questionLabel}>Question 7 of 8: Teaching Others</Text>

        <View style={styles.card}>
          <Text style={styles.prompt}>
            What’s something you’d love to teach others?
            Share a skill, idea, or passion you enjoy passing on.
          </Text>

          <View style={styles.recorderWrap}>
            <MicrophoneRecorder
              onFinish={handleFinish}
              onPartialText={(partial) => setLiveText(partial)}
            />
          </View>

          <Text style={styles.talkHint}>Talk for 3 minutes</Text>

          <View style={styles.transcriptionBox}>
            <Text style={styles.transcriptionText}>
              {liveText ||
                recordedText ||
                "Tap the microphone to start recording your answer"}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => router.push("/profile/MeetingAudio")}
            >
              <Text style={styles.nextButtonText}>Next →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            💡 You can skip any question by pressing &quot;Next&quot;
          </Text>
        </View>

        {Platform.OS === "web" && recordedText !== "" && (
          <View style={styles.webButtonsWrap}>
            {audioUri && (
              <TouchableOpacity
                style={styles.webButton}
                onPress={downloadWebAudio}
              >
                <Text style={styles.webButtonText}>⬇️ Download Audio</Text>
              </TouchableOpacity>
            )}

            {csvText !== "" && (
              <TouchableOpacity
                style={styles.webButton}
                onPress={downloadWebCSV}
              >
                <Text style={styles.webButtonText}>⬇️ Download CSV</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3FF",
  },

  inner: {
    flex: 1,
    paddingTop: 18,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  appName: {
    alignSelf: "flex-start",
    fontSize: 20,
    fontWeight: "700",
    color: "#2F80ED",
    marginBottom: 10,
  },

  header: {
    alignItems: "center",
    marginBottom: 18,
  },

  setupTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#2F5BD2",
    textAlign: "center",
    marginBottom: 6,
  },

  setupSubtitle: {
    fontSize: 15,
    color: "#3A72D8",
    textAlign: "center",
  },

  progressBarBackground: {
    width: "100%",
    height: 10,
    backgroundColor: "#DDE3ED",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 14,
  },

  progressBarFill: {
    width: "87.5%", // Question 7 of 8
    height: "100%",
    backgroundColor: "#2F80ED",
    borderRadius: 999,
  },

  questionLabel: {
    fontSize: 16,
    color: "#666",
    marginBottom: 18,
  },

  card: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },

  prompt: {
    fontSize: 22,
    color: "#333",
    textAlign: "center",
    lineHeight: 32,
    marginBottom: 28,
  },

  recorderWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  talkHint: {
    fontSize: 20,
    color: "#2F5BD2",
    marginBottom: 20,
  },

  transcriptionBox: {
    width: "100%",
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B7CBF5",
    backgroundColor: "#F4F8FF",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 26,
  },

  transcriptionText: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 15,
  },

  buttonRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  backButton: {
    flex: 1,
    backgroundColor: "#F5FAFF",
    borderWidth: 1,
    borderColor: "#8DB7FF",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },

  backButtonText: {
    fontSize: 18,
    color: "#222",
    fontWeight: "500",
  },

  nextButton: {
    flex: 1,
    backgroundColor: "#2F80ED",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#2F80ED",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },

  nextButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "600",
  },

  noteBox: {
    width: "100%",
    backgroundColor: "#E8F1FF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginTop: 16,
    alignItems: "center",
  },

  noteText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
  },

  webButtonsWrap: {
    marginTop: 20,
    width: "100%",
    alignItems: "center",
  },

  webButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 10,
  },

  webButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
