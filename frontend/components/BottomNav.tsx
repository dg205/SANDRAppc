import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type Tab = "home" | "matches" | "messages" | "profile";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { key: Tab; label: string; icon: IconName; activeIcon: IconName; href: any }[] = [
  { key: "home", label: "Home", icon: "home-outline", activeIcon: "home", href: "/home" },
  {
    key: "matches",
    label: "Matches",
    icon: "people-outline",
    activeIcon: "people",
    href: "/profile/MatchResults",
  },
  {
    key: "messages",
    label: "Messages",
    icon: "chatbubble-outline",
    activeIcon: "chatbubble",
    href: "/profile/Requests",
  },
  {
    key: "profile",
    label: "Profile",
    icon: "person-outline",
    activeIcon: "person",
    href: { pathname: "/profile/ProfileSummary", params: { from: "tab" } },
  },
];

// The bar along the bottom of the four main screens. Switching tabs replaces
// the current screen rather than stacking a new one on top, so Back doesn't
// walk through every tab visited.
export default function BottomNav({ active }: { active: Tab }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, selected && styles.tabActive]}
            onPress={() => !selected && router.replace(tab.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={selected ? tab.activeIcon : tab.icon}
              size={24}
              color={selected ? "#2F80ED" : "#6B7280"}
            />
            <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#DDE3ED",
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    marginHorizontal: 4,
    borderRadius: 12,
  },
  tabActive: { backgroundColor: "#EAF3FF" },
  label: { fontSize: 13, color: "#6B7280", marginTop: 2, fontWeight: "500" },
  labelActive: { color: "#2F80ED", fontWeight: "700" },
});
