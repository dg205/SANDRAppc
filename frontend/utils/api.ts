import { Platform } from "react-native";

// Priority order:
//  1. EXPO_PUBLIC_API_URL in your .env file (set this for production/cloud)
//  2. Fallback to localhost for web, or LAN IP for Android/iOS dev
const CLOUD_URL = process.env.EXPO_PUBLIC_API_URL;

// Only needed for local development (not used when EXPO_PUBLIC_API_URL is set)
const LAN_IP = process.env.EXPO_PUBLIC_LAN_IP || "192.168.86.30";

export const BASE_URL: string =
  CLOUD_URL
    ? CLOUD_URL
    : Platform.OS === "android" || Platform.OS === "ios"
    ? `http://${LAN_IP}:5000`
    : "http://127.0.0.1:5000";

console.log("BASE_URL ACTUALLY USED =", BASE_URL);

export async function checkHealth(): Promise<{ status: string }> {
  console.log("Checking health at:", `${BASE_URL}/health`);

  const res = await fetch(`${BASE_URL}/health`);
  const text = await res.text();

  console.log("Health status =", res.status);
  console.log("Health raw body =", text);

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

export async function getTopMatches(
  targetUser: Record<string, any>,
  candidates: Record<string, any>[]
): Promise<{ matches: any[]; total_candidates: number }> {
  console.log("Posting matches to:", `${BASE_URL}/api/match`);

  const res = await fetch(`${BASE_URL}/api/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetUser, candidates }),
  });

  const text = await res.text();

  console.log("Match status =", res.status);
  console.log("Match raw body =", text);

  if (!res.ok) {
    throw new Error(`Match request failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}

export async function addUser(
  userData: Record<string, any>
): Promise<{ status: string; userId: string }> {
  console.log("Posting user to:", `${BASE_URL}/api/users`);

  const res = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });

  const text = await res.text();

  console.log("Add user status =", res.status);
  console.log("Add user raw body =", text);

  if (!res.ok) {
    throw new Error(`Add user failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}
