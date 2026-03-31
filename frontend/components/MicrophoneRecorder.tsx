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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const latestTextRef = useRef("");

  // Native recorder refs/locks
  const recordingRef = useRef<Audio.Recording | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);

  function makeCsv(text: string) {
    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter(Boolean);

    return ["word", ...words].join("\n");
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =========================
  // WEB
  // =========================
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

    finalTextRef.current = "";
    latestTextRef.current = "";

    const recognition = new SR();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      latestTextRef.current = transcript;
      onPartialText?.(transcript);

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
        console.warn("SpeechRecognition error:", event.error);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (_) {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }

  function stopWebRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);

    const text = finalTextRef.current || latestTextRef.current || "";
    finalTextRef.current = "";
    latestTextRef.current = "";

    const csvContent = makeCsv(text);

    onFinish?.({
      audioUri: null,
      text,
      csv: csvContent,
      csvUri: null,
    });
  }

  // =========================
  // NATIVE
  // =========================
  async function startNativeRecording() {
    if (isStartingRef.current || isStoppingRef.current || recordingRef.current) {
      return;
    }

    isStartingRef.current = true;

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

      recordingRef.current = rec;
      setRecording(rec);
    } catch (err) {
      console.error("startNativeRecording error:", err);
      Alert.alert("Recording Error", String(err));
    } finally {
      isStartingRef.current = false;
    }
  }

  async function transcribeNativeAudio(uri: string): Promise<string> {
    try {
      const filename = uri.split("/").pop() || `recording-${Date.now()}.m4a`;
      const lower = filename.toLowerCase();

      let mimeType = "audio/mp4";
      if (lower.endsWith(".wav")) mimeType = "audio/wav";
      else if (lower.endsWith(".mp3")) mimeType = "audio/mpeg";
      else if (lower.endsWith(".aac")) mimeType = "audio/aac";
      else if (lower.endsWith(".m4a")) mimeType = "audio/mp4";
      else if (lower.endsWith(".caf")) mimeType = "audio/x-caf";

      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: filename,
        type: mimeType,
      } as any);

      const response = await fetch(`${BASE_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      const raw = await response.text();

      if (!response.ok) {
        throw new Error(raw || `HTTP ${response.status}`);
      }

      const data = JSON.parse(raw);
      return data.text || "";
    } catch (err) {
      console.error("transcribeNativeAudio error:", err);
      Alert.alert("Transcription Error", String(err));
      return "";
    }
  }

  async function stopNativeRecording() {
    if (isStoppingRef.current) return;

    const rec = recordingRef.current;
    if (!rec) return;

    isStoppingRef.current = true;

    let uri: string | null = null;

    try {
      // Small delay helps avoid stopping too quickly after start on Android
      if (Platform.OS === "android") {
        await sleep(300);
      }

      await rec.stopAndUnloadAsync();
      uri = rec.getURI();

      recordingRef.current = null;
      setRecording(null);

      // Small cooldown so Android fully releases the recorder
      if (Platform.OS === "android") {
        await sleep(400);
      }

      let text = "";
      if (uri) {
        text = await transcribeNativeAudio(uri);
        onPartialText?.(text);
      }

      const csvContent = makeCsv(text);

      let savedAudioPath: string | null = null;
      let savedCsvPath: string | null = null;

      if (uri) {
        const folder = FileSystem.documentDirectory + "recordings/";
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

        const originalName = uri.split("/").pop() || `audio_${Date.now()}.m4a`;
        const ext = originalName.includes(".") ? originalName.split(".").pop() : "m4a";

        savedAudioPath = folder + `audio_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: savedAudioPath });

        savedCsvPath = folder + `transcript_${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(savedCsvPath, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      onFinish?.({
        audioUri: savedAudioPath || uri,
        text,
        csv: csvContent,
        csvUri: savedCsvPath,
      });
    } catch (err) {
      console.error("stopNativeRecording error:", err);

      // Force-clear local refs/state even if stop failed
      recordingRef.current = null;
      setRecording(null);

      Alert.alert("Stop Recording Error", String(err));
    } finally {
      if (Platform.OS === "android") {
        await sleep(250);
      }
      isStoppingRef.current = false;
    }
  }

  function handleStart() {
    if (Platform.OS === "web") {
      startWebRecording();
    } else {
      void startNativeRecording();
    }
  }

  function handleStop() {
    if (Platform.OS === "web") {
      stopWebRecording();
    } else {
      void stopNativeRecording();
    }
  }

  const active = recording !== null || isListening;

  return (
    <View style={styles.container}>
      {!active ? (
        <>
          <TouchableOpacity
            style={styles.micButton}
            onPress={handleStart}
            disabled={isStartingRef.current || isStoppingRef.current}
          >
            <Text style={styles.micIcon}>🎤</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Tap to start recording</Text>
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.stopButton}
            onPress={handleStop}
            disabled={isStartingRef.current || isStoppingRef.current}
          >
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
