import React, { createContext, useContext, useState, type ReactNode } from "react";

export type UserType = "senior" | "companion" | "";

export type ProfileData = {
  userType: UserType;
  name: string;
  age: number | null;
  location: string;
  faith: string;
  interests: string[];
  languages: string[];
  culturalBackground: string;
  values: string[];
  favoriteFood: string[];
  helpWith: string[];
  talkPreferences: string[];
  connectionGoals: string[];
  familySituation: string;
  availableDays: string[];
  bio: string;
  email: string;
  // audio transcript fields
  hobbiesText?: string;
  hobbiesAudioUri?: string | null;
  commPreferenceText?: string;
  commPreferenceAudioUri?: string | null;
  gettingHelpText?: string;
  availabilityText?: string;
  meetingText?: string;
  // server-side audio paths returned from /api/transcribe
  hobbiesAudioServerPath?: string | null;
  commPreferenceAudioServerPath?: string | null;
  bioAudioServerPath?: string | null;
  gettingHelpAudioServerPath?: string | null;
  meetingAudioServerPath?: string | null;
  availabilityAudioServerPath?: string | null;
};

const defaultProfile: ProfileData = {
  userType: "",
  name: "",
  age: null,
  location: "",
  faith: "",
  interests: [],
  languages: [],
  culturalBackground: "",
  values: [],
  favoriteFood: [],
  helpWith: [],
  talkPreferences: [],
  connectionGoals: [],
  familySituation: "",
  availableDays: [],
  bio: "",
  email: "",
};

type ProfileContextType = {
  profile: ProfileData;
  updateProfile: (partial: Partial<ProfileData>) => void;
  resetProfile: () => void;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData>(defaultProfile);

  const updateProfile = (partial: Partial<ProfileData>) => {
    setProfile((prev) => ({ ...prev, ...partial }));
  };

  const resetProfile = () => setProfile(defaultProfile);

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, resetProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
