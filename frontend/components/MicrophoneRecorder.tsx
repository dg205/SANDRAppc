import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { BASE_URL } from "../utils/api";

type MicrophoneRecorderProps = {
  onPartialText?: (text: string) => void;
  onFinish?: (data: {
    audioUri: string | null;
    text: string;
    csv: string;
    csvUri: string | null;
  }) => void;
};

export default function MicrophoneRecorder({
  onPartialText,
  onFinish,
}: MicrophoneRecorderProps) {
  // Native recording state (expo-av)
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  // Web-only: tracks whether SpeechRecognition is active
  // (we never use expo-av Audio.Recording on web — it's unreliable there)
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const finalTextRef   = useRef("");  // set when Chrome fires isFinal=true
  const latestTextRef  = useRef("");  // updated on every result (interim + final)

  // ─────────────────────────────────────────────────────────────────────────
  // WEB PATH — SpeechRecognition only, no expo-av
  // ─────────────────────────────────────────────────────────────────────────

  function startWebRecording() {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SR) {
      Alert.alert(
        "Browser Not Supported",
        "Voice recording requires Chrome or Edge. Please open the app in Chrome."
      );
      return;
    }

    // Reset transcript state for this session
    finalTextRef.current  = "";
    latestTextRef.current = "";

    const recognition = new SR();
    recognition.interimResults = true;
    recognition.continuous     = true;
    recognition.lang           = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      // Always keep the latest text — used as fallback if isFinal never fires
      latestTextRef.current = transcript;

      // Show live text while speaking
      if (onPartialText) onPartialText(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        finalTextRef.current = transcript;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        Alert.alert(
          "Microphone Blocked",
          "Please allow microphone access in your browser settings, then try again."
        );
        recognitionRef.current = null;
        setIsListening(false);
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        // no-speech and aborted are harmless; others are worth logging
        console.warn("SpeechRecognition error:", event.error);
      }
    };

    // Chrome auto-stops recognition after silence or ~60 s.
    // Auto-restart it so recording keeps going until the user hits ⏹.
    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (_) { /* already stopped */ }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }

  function stopWebRecording() {
    if (recognitionRef.current) {
      // Clear onend first so the auto-restart doesn't fire after we stop
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);

    const text = finalTextRef.current || latestTextRef.current || "";
    finalTextRef.current  = "";
    latestTextRef.current = "";

    const words      = text.replace(/\n/g, " ").split(" ").map(w => w.trim()).filter(Boolean);
    const csvContent = ["word", ...words].join("\n");

    if (onFinish) {
      onFinish({ audioUri: null, text, csv: csvContent, csvUri: null });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NATIVE PATH — expo-av only
  // ─────────────────────────────────────────────────────────────────────────

  async function startNativeRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Microphone access is needed to record your voice.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
    } catch (err) {
      Alert.alert("Recording Error", String(err));
    }
  }

  async function stopNativeRecording() {
    let uri: string | null = null;

    if (recording) {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
      setRecording(null);
    }

    // Send audio to Flask backend for Whisper transcription
    let text = "";
    console.log("Transcription target URL:", `${BASE_URL}/api/transcribe`);
    console.log("Audio URI:", uri);
    if (uri) {
      try {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const response = await fetch(`${BASE_URL}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64Audio, format: "m4a" }),
        });

        if (response.ok) {
          const data = await response.json();
          text = data.text || "";
          if (onPartialText) onPartialText(text);
        } else {
          console.warn("Transcription failed:", await response.text());
        }
      } catch (err) {
        console.warn("Transcription error:", err);
      }
    }

    const words      = text.replace(/\n/g, " ").split(" ").map((w: string) => w.trim()).filter(Boolean);
    const csvContent = ["word", ...words].join("\n");

    let savedAudioPath: string | null = null;
    let savedCsvPath: string | null   = null;

    if (uri) {
      const folder = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

      const audioFilename = `audio_${Date.now()}.m4a`;
      savedAudioPath = folder + audioFilename;
      await FileSystem.copyAsync({ from: uri, to: savedAudioPath });

      const csvFilename = `transcript_${Date.now()}.csv`;
      savedCsvPath = folder + csvFilename;
      await FileSystem.writeAsStringAsync(savedCsvPath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    if (onFinish) {
      onFinish({ audioUri: savedAudioPath || uri, text, csv: csvContent, csvUri: savedCsvPath });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Unified handlers — route to web or native
  // ─────────────────────────────────────────────────────────────────────────

  function handleStart() {
    if (Platform.OS === "web") {
      startWebRecording();
    } else {
      startNativeRecording();
    }
  }

  async function handleStop() {
    if (Platform.OS === "web") {
      stopWebRecording();
    } else {
      await stopNativeRecording();
    }
  }

  // Show stop button when either expo-av recording OR web SpeechRecognition is active
  const active = recording !== null || isListening;

  return (
    <View style={styles.container}>
      {!active ? (
        <>
          <TouchableOpacity style={styles.micButton} onPress={handleStart}>
            <Text style={styles.micIcon}>🎤</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Tap to start recording</Text>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Tap to stop recording</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },

  micButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#F7A531",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#D98200",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    marginBottom: 12,
  },

  micIcon: {
    fontSize: 42,
    color: "#FFFFFF",
  },

  stopButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#E74C3C",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#B3392B",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    marginBottom: 12,
  },

  stopIcon: {
    fontSize: 38,
    color: "#FFFFFF",
  },

  helperText: {
    fontSize: 16,
    color: "#2F5BD2",
    textAlign: "center",
  },
});
