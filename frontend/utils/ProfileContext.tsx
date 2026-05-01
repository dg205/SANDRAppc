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
  locationText?: string;
  locationAudioUri?: string | null;
  hobbiesText?: string;
  hobbiesAudioUri?: string | null;
  valuesText?: string;
  valuesAudioUri?: string | null;
  gettingHelpText?: string;
  teachingText?: string;
  meetingText?: string;
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
