import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { BASE_URL } from "../utils/api";

type RecorderFinishData = {
  audioUri: string | null;
  text: string;
  csv: string;
  csvUri: string | null;
  uploadedAudioPath?: string | null;
};

type MicrophoneRecorderProps = {
  onPartialText?: (text: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onFinish?: (data: RecorderFinishData) => void;
};

export default function MicrophoneRecorder({
  onPartialText,
  onRecordingChange,
  onFinish,
}: MicrophoneRecorderProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [savedAudioUri, setSavedAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [transcription, setTranscription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pendingResult, setPendingResult] = useState<RecorderFinishData | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const latestTextRef = useRef("");

  const active = recording !== null || isListening;

  function buildCsv(text: string) {
    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w) => w.trim())
      .filter(Boolean);

    return ["word", ...words].join("\n");
  }

  function resetStateForNewRecording() {
    finalTextRef.current = "";
    latestTextRef.current = "";
    setTranscription("");
    setConfirmed(false);
    setPendingResult(null);
    setSavedAudioUri(null);
  }

  // -----------------------------
  // WEB RECORDING
  // -----------------------------
  function startWebRecording() {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SR) {
      Alert.alert(
        "Browser Not Supported",
        "Voice recording requires Chrome or Edge."
      );
      return;
    }

    resetStateForNewRecording();

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
      setTranscription(transcript);
      setConfirmed(false);
      onPartialText?.(transcript);

      if (event.results[event.results.length - 1]?.isFinal) {
        finalTextRef.current = transcript;
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("SpeechRecognition error:", event.error);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stopWebRecording() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    setIsListening(false);

    const text = (latestTextRef.current || finalTextRef.current || "").trim();
    const csvContent = buildCsv(text);

    setTranscription(text);
    setConfirmed(false);

    setPendingResult({
      audioUri: null,
      text,
      csv: csvContent,
      csvUri: null,
      uploadedAudioPath: null,
    });
  }

  // -----------------------------
  // NATIVE RECORDING
  // -----------------------------
  async function startNativeRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission Required", "Microphone access is needed.");
        return;
      }

      resetStateForNewRecording();

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
    } catch (err) {
      Alert.alert("Recording Error", String(err));
    }
  }

  async function stopNativeRecording() {
    if (!recording) return;

    setIsProcessing(true);

    let uri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (err) {
      console.warn("Failed to stop recording:", err);
      Alert.alert("Recording Error", "Could not stop recording properly.");
    } finally {
      setRecording(null);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (modeErr) {
        console.warn("Audio mode reset error:", modeErr);
      }
    }

    if (!uri) {
      setIsProcessing(false);
      return;
    }

    let savedAudioPath: string | null = null;
    let savedCsvPath: string | null = null;

    try {
      const folder = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

      const timestamp = Date.now();
      savedAudioPath = `${folder}audio_${timestamp}.m4a`;
      savedCsvPath = `${folder}transcript_${timestamp}.csv`;

      await FileSystem.copyAsync({
        from: uri,
        to: savedAudioPath,
      });

      setSavedAudioUri(savedAudioPath);

      const emptyCsv = buildCsv("");
      await FileSystem.writeAsStringAsync(savedCsvPath, emptyCsv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (err) {
      console.warn("Local save error:", err);
    }

    // IMPORTANT:
    // Create pendingResult immediately so Confirm button appears on mobile.
    const immediateResult: RecorderFinishData = {
      audioUri: savedAudioPath || uri,
      text: "",
      csv: buildCsv(""),
      csvUri: savedCsvPath,
      uploadedAudioPath: null,
    };

    setPendingResult(immediateResult);
    setConfirmed(false);

    // Continue transcription in background of this function
    try {
      const formData = new FormData();

      formData.append(
        "audio",
        {
          uri,
          name: "recording.m4a",
          type: "audio/m4a",
        } as any
      );

      const response = await fetch(`${BASE_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      const raw = await response.text();
      console.log("Transcribe status =", response.status);
      console.log("Transcribe raw body =", raw);

      if (!response.ok) {
        throw new Error(`Transcription failed (${response.status}): ${raw}`);
      }

      const data = JSON.parse(raw);
      const text = (data.text || "").trim();
      const uploadedAudioPath = data.saved_audio_path || null;
      const csvContent = buildCsv(text);

      setTranscription(text);
      onPartialText?.(text);

      if (savedCsvPath) {
        try {
          await FileSystem.writeAsStringAsync(savedCsvPath, csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });
        } catch (csvErr) {
          console.warn("CSV rewrite error:", csvErr);
        }
      }

      setPendingResult({
        audioUri: savedAudioPath || uri,
        text,
        csv: csvContent,
        csvUri: savedCsvPath,
        uploadedAudioPath,
      });
    } catch (err) {
      console.warn("Transcription/upload error:", err);

      // Keep pendingResult so the confirm button still shows
      Alert.alert(
        "Transcription Issue",
        "Recording was saved, but transcription could not be completed. You can still confirm and continue."
      );
    } finally {
      setIsProcessing(false);
    }
  }

  // -----------------------------
  // PLAYBACK
  // -----------------------------
  async function playSavedAudio() {
    try {
      const audioToPlay = savedAudioUri || pendingResult?.audioUri;

      if (!audioToPlay) {
        Alert.alert("No Audio", "Record audio first.");
        return;
      }

      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioToPlay },
        { shouldPlay: true }
      );

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        setIsPlaying(status.isPlaying);

        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      setSound(newSound);
    } catch (err) {
      Alert.alert("Playback Error", String(err));
    }
  }

  async function stopPlayback() {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    setIsPlaying(false);
  }

  // -----------------------------
  // HANDLERS
  // -----------------------------
  function handleStart() {
    if (isProcessing || active) return;

    if (Platform.OS === "web") {
      startWebRecording();
    } else {
      startNativeRecording();
    }

    onRecordingChange?.(true);
  }

  async function handleStop() {
    if (Platform.OS === "web") {
      stopWebRecording();
    } else {
      await stopNativeRecording();
    }

    onRecordingChange?.(false);
  }

  function handleConfirm() {
    if (!pendingResult) return;

    const finalText = transcription.trim() || pendingResult.text || "";
    const finalCsv = buildCsv(finalText);

    const finalPayload: RecorderFinishData = {
      ...pendingResult,
      text: finalText,
      csv: finalCsv,
    };

    setPendingResult(finalPayload);
    setConfirmed(true);

    onFinish?.(finalPayload);
  }

  // -----------------------------
  // VISUALIZER
  // -----------------------------
  const BAR_COUNT = 7;
  const barAnims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (active) {
      const animations = barAnims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 80),
            Animated.timing(anim, {
              toValue: 1,
              duration: 300 + i * 40,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration: 300 + i * 40,
              useNativeDriver: true,
            }),
          ])
        )
      );

      animations.forEach((a) => a.start());
      return () => animations.forEach((a) => a.stop());
    } else {
      barAnims.forEach((anim) => anim.setValue(0.3));
    }
  }, [active, barAnims]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  return (
    <View style={styles.container}>
      {!active ? (
        <>
          <TouchableOpacity
            style={[styles.micButton, isProcessing && styles.disabledButton]}
            onPress={handleStart}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#FFFFFF" />
            ) : (
              <Text style={styles.micIcon}>🎤</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            {isProcessing ? "Processing recording..." : "Tap to start recording"}
          </Text>
        </>
      ) : (
        <>
          <View style={styles.waveformContainer}>
            {barAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[styles.bar, { transform: [{ scaleY: anim }] }]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>Tap to stop recording</Text>
        </>
      )}

      {!!(savedAudioUri || pendingResult?.audioUri) && !isPlaying && !active && (
        <TouchableOpacity style={styles.playButton} onPress={playSavedAudio}>
          <Text style={styles.playText}>▶ Play Saved Audio</Text>
        </TouchableOpacity>
      )}

      {isPlaying && (
        <TouchableOpacity style={styles.playButton} onPress={stopPlayback}>
          <Text style={styles.playText}>⏹ Stop Audio</Text>
        </TouchableOpacity>
      )}

      <View style={styles.transcriptionBox}>
        <Text style={styles.transcriptionText}>
          {transcription || pendingResult?.text || "Tap the microphone to start recording your answer"}
        </Text>
      </View>

      {pendingResult && !active && (
        <TouchableOpacity
          style={[
            styles.confirmButton,
            confirmed && styles.confirmButtonDone,
          ]}
          onPress={handleConfirm}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>
            {confirmed ? "Confirmed ✓" : "Confirm"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
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
    elevation: 6,
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.7,
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
  playButton: {
    marginTop: 12,
    backgroundColor: "#2F80ED",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  playText: {
    color: "#fff",
    fontWeight: "600",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    gap: 5,
    marginBottom: 16,
  },
  bar: {
    width: 5,
    height: 50,
    borderRadius: 4,
    backgroundColor: "#E74C3C",
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
    marginTop: 20,
  },
  transcriptionText: {
    textAlign: "center",
    color: "#6B7280",
    fontSize: 15,
  },
  confirmButton: {
    width: "100%",
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  confirmButtonDone: {
    backgroundColor: "#059669",
  },
  confirmButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
