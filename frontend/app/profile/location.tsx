import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import MicrophoneRecorder from "../../components/MicrophoneRecorder";
import { router } from "expo-router";
import { useProfile } from "../../utils/ProfileContext";

export default function Location() {
  const { updateProfile } = useProfile();
  const [liveText, setLiveText] = useState("");
  const [recordedText, setRecordedText] = useState("");
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");

  const handleFinish = async ({ audioUri, text, csv }) => {
    setLiveText("");
    setRecordedText(text);
    setAudioUri(audioUri);
    setCsvText(csv);

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

    const fileName = `location_audio_${Date.now()}.m4a`;
    const dest = audioDir + fileName;

    await FileSystem.copyAsync({ from: uri, to: dest });
  };

  const saveTranscription = async (text: string) => {
    const transDir = FileSystem.documentDirectory + "transcriptions/";
    await FileSystem.makeDirectoryAsync(transDir, { intermediates: true });

    const fileName = `location_transcription_${Date.now()}.txt`;
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

    const fileName = `location_words_${Date.now()}.csv`;
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
    a.download = "location_audio.m4a";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadWebCSV = () => {
    if (!csvText) return;

    const blob = new Blob([csvText], { type: "text/csv" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "location_words.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Tell us where you live</Text>

        <MicrophoneRecorder
          onFinish={handleFinish}
          onPartialText={(partial) => setLiveText(partial)}
        />

        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => {
            updateProfile({ location: recordedText.trim() });
            router.push("/profile/hobbies");
          }}
        >
          <Text style={styles.nextText}>Next →</Text>
        </TouchableOpacity>
      </View>

      {/* TRANSCRIPTION BOX */}
      <View style={styles.footerBox}>
        <Text style={styles.footerText}>
          {liveText ||
            recordedText ||
            "Talk for a few minutes. Your recorded text will appear here."}
        </Text>
      </View>

      {/* WEB-ONLY DOWNLOAD BUTTONS — SHOW AFTER STOP */}
      {Platform.OS === "web" && recordedText !== "" && (
        <View style={{ marginTop: 20, width: "100%", alignItems: "center" }}>
          {audioUri && (
            <TouchableOpacity style={styles.webButton} onPress={downloadWebAudio}>
              <Text style={styles.webButtonText}>⬇️ Download Audio</Text>
            </TouchableOpacity>
          )}

          {csvText !== "" && (
            <TouchableOpacity style={styles.webButton} onPress={downloadWebCSV}>
              <Text style={styles.webButtonText}>⬇️ Download CSV</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
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

  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },

  nextButton: {
    marginTop: 25,
    backgroundColor: "#F2F6FF",
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 10,
    borderColor: "#8AB4FF",
    borderWidth: 1,
  },

  nextText: {
    fontSize: 18,
  },

  footerBox: {
    marginTop: 20,
    backgroundColor: "#D9E8FF",
    padding: 15,
    borderRadius: 12,
    width: "100%",
  },

  footerText: {
    textAlign: "center",
    color: "#333",
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
