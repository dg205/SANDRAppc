import { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, Animated } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { BASE_URL } from "../utils/api";

type MicrophoneRecorderProps = {
  onPartialText?: (text: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  onFinish?: (data: {
    audioUri: string | null;
    text: string;
    csv: string;
    csvUri: string | null;
    uploadedAudioPath?: string | null;
  }) => void;
};

export default function MicrophoneRecorder({
  onPartialText,
  onRecordingChange,
  onFinish,
}: MicrophoneRecorderProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isListening, setIsListening] = useState(false);

  const [savedAudioUri, setSavedAudioUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const recognitionRef = useRef<any>(null);
  const finalTextRef = useRef("");
  const latestTextRef = useRef("");

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
      if (onPartialText) onPartialText(transcript);

      if (event.results[event.results.length - 1].isFinal) {
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
  }

  // -----------------------------
  // NATIVE RECORDING (iOS + Android)
  // Records audio then sends to Groq Whisper via backend for transcription
  // Works in Expo Go on both platforms — no dev build needed
  // -----------------------------
  async function startNativeRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Microphone access is needed.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
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

    let text = "";
    let uploadedAudioPath: string | null = null;

    if (uri) {
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
        text = data.text || "";
        uploadedAudioPath = data.saved_audio_path || null;

        if (onPartialText) onPartialText(text);
      } catch (err) {
        console.warn("Transcription/upload error:", err);
      }
    }

    const words = text
      .replace(/\n/g, " ")
      .split(" ")
      .map((w: string) => w.trim())
      .filter(Boolean);

    const csvContent = ["word", ...words].join("\n");

    let savedAudioPath: string | null = null;
    let savedCsvPath: string | null = null;

    if (uri) {
      const folder = FileSystem.documentDirectory + "recordings/";
      await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

      const audioFilename = `audio_${Date.now()}.m4a`;
      savedAudioPath = folder + audioFilename;

      await FileSystem.copyAsync({
        from: uri,
        to: savedAudioPath,
      });

      setSavedAudioUri(savedAudioPath);

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
        uploadedAudioPath,
      });
    }
  }

  // -----------------------------
  // PLAYBACK
  // -----------------------------
  async function playSavedAudio() {
    try {
      if (!savedAudioUri) {
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
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: savedAudioUri },
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

  const active = recording !== null || isListening;

  // -----------------------------
  // AUDIO VISUALIZER BARS (visual only)
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
  }, [active]);

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
          {/* Animated waveform bars */}
          <View style={styles.waveformContainer}>
            {barAnims.map((anim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.bar,
                  { transform: [{ scaleY: anim }] },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Text style={styles.stopIcon}>⏹</Text>
          </TouchableOpacity>
          <Text style={styles.helperText}>Tap to stop recording</Text>
        </>
      )}

      {savedAudioUri && !isPlaying && (
        <TouchableOpacity style={styles.playButton} onPress={playSavedAudio}>
          <Text style={styles.playText}>▶ Play Saved Audio</Text>
        </TouchableOpacity>
      )}

      {isPlaying && (
        <TouchableOpacity style={styles.playButton} onPress={stopPlayback}>
          <Text style={styles.playText}>⏹ Stop Audio</Text>
        </TouchableOpacity>
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
});
