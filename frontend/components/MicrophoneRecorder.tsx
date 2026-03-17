import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

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
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalTextRef   = useRef("");   // set only when Chrome fires isFinal=true
  const latestTextRef  = useRef("");   // updated on EVERY result (interim + final)

  async function startRecording() {
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

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
    } catch (err) {
      Alert.alert("Recording Error", String(err));
      return;
    }

    if (Platform.OS === "web") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let transcript = "";

        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        // Always keep the most recent transcript, whether interim or final.
        // This is the fallback used if Chrome never fires isFinal=true
        // (e.g. when the user speaks continuously and hits stop immediately).
        latestTextRef.current = transcript;

        const isFinal = event.results[event.results.length - 1].isFinal;

        // Show live partial text while speaking
        if (onPartialText) {
          onPartialText(transcript);
        }

        if (isFinal) {
          finalTextRef.current = transcript;
        }
      };

      recognition.onerror = (event: any) => {
        // Silently ignore "no-speech" — it's not a real error
        if (event.error !== "no-speech") {
          console.warn("SpeechRecognition error:", event.error);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    }
  }

  async function stopRecording() {
    let uri: string | null = null;

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

    // Prefer a confirmed-final transcript; fall back to the last interim one.
    // Chrome often never fires isFinal=true if the user speaks without pausing,
    // so latestTextRef gives us the text that was visible in the live box.
    const text = finalTextRef.current || latestTextRef.current || "";

    // Reset refs for next recording session
    finalTextRef.current  = "";
    latestTextRef.current = "";

    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);

    const csvContent = ["word", ...words].join("\n");

    let savedAudioPath: string | null = null;
    let savedCsvPath: string | null = null;

    if (Platform.OS !== "web") {
      const folder = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

      if (uri) {
        const audioFilename = `audio_${Date.now()}.m4a`;
        savedAudioPath = folder + audioFilename;

        await FileSystem.copyAsync({
          from: uri,
          to: savedAudioPath,
        });
      }

      const csvFilename = `transcript_${Date.now()}.csv`;
      savedCsvPath = folder + csvFilename;

      await FileSystem.writeAsStringAsync(savedCsvPath, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    if (onFinish) {
      onFinish({
        audioUri: savedAudioPath || uri,
        text,
        csv: csvContent,
        csvUri: savedCsvPath,
      });
    }
  }

  return (
    <View style={styles.container}>
      {!recording ? (
        <>
          <TouchableOpacity style={styles.micButton} onPress={startRecording}>
            <Text style={styles.micIcon}>🎤</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Tap to start recording</Text>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
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
