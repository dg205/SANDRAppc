import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Audio } from "expo-av";

export default function MicrophoneRecorder({ onPartialText, onFinish }) {
  const [recording, setRecording] = useState(null);
  const [audioUri, setAudioUri] = useState(null);
  const recognitionRef = useRef(null);
  const finalTextRef = useRef("");

  async function startRecording() {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    setRecording(recording);

    // Web speech recognition
    if (Platform.OS === "web") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const isFinal = event.results[event.results.length - 1].isFinal;

        if (!isFinal && onPartialText) {
          onPartialText(transcript);
        }

        if (isFinal) {
          finalTextRef.current = transcript;
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    }
  }

  async function stopRecording() {
    let uri = null;

    if (recording) {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
      setAudioUri(uri);
      setRecording(null);
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const text = finalTextRef.current || "";

    // Build CSV immediately
    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    const csvContent = ["word", ...words].join("\n");

    if (onFinish) {
      onFinish({
        audioUri: uri,
        text,
        csv: csvContent,
      });
    }
  }

  return (
    <View style={styles.container}>
      {!recording ? (
        <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
          <Text style={styles.recordText}>🎤 Start Recording</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
          <Text style={styles.stopText}>⏹ Stop</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 40, alignItems: "center" },
  recordButton: {
    backgroundColor: "#ffb74d",
    padding: 20,
    borderRadius: 20,
  },
  recordText: { fontSize: 18 },
  stopButton: {
    backgroundColor: "red",
    padding: 20,
    borderRadius: 20,
  },
  stopText: { color: "#fff", fontSize: 18 },
});
