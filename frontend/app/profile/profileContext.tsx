import React, { createContext, useContext, useMemo, useState } from "react";

export type ProfileDraft = {
  age?: string;
  locationText?: string;
  hobbiesText?: string;
  valuesText?: string;
  bio?: string;

  // optional debug fields if you want them
  locationAudioUri?: string | null;
  hobbiesAudioUri?: string | null;
  valuesAudioUri?: string | null;
};

type ProfileContextValue = {
  profile: ProfileDraft;
  setProfile: (patch: Partial<ProfileDraft>) => void;
  resetProfile: () => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<ProfileDraft>({});

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      setProfile: (patch) => setProfileState((p) => ({ ...p, ...patch })),
      resetProfile: () => setProfileState({}),
    }),
    [profile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
