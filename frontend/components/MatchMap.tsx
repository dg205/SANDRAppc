/**
 * MatchMap.tsx
 * Displays a stylised Atlanta-metro map with coloured pins for each match.
 * Uses percentage-based absolute positioning (works on Expo web / Chrome).
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Approximate [left%, top%] within the map container (North = top).
// Bounding box covers roughly the Atlanta metro.
const CITY_POS: Record<string, [number, number]> = {
  "atlanta":       [46, 50],
  "decatur":       [63, 55],
  "marietta":      [30, 28],
  "smyrna":        [32, 43],
  "norcross":      [73, 24],
  "roswell":       [60, 13],
  "sandy springs": [57, 34],
  "kennesaw":      [22, 18],
  "dunwoody":      [61, 36],
};

const PIN_COLORS = ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12"];

interface MapMatch {
  name: string;
  location: string;
}

export default function MatchMap({
  matches,
  userLocation,
}: {
  matches: MapMatch[];
  userLocation?: string;
}) {
  const userCity = (userLocation ?? "").toLowerCase().trim();
  const userPos = userCity ? CITY_POS[userCity] : undefined;
  // Only render pins for cities we have coordinates for
  const pinsWithPos = matches
    .map((m, i) => {
      const city = (m.location ?? "").toLowerCase().trim();
      const pos = CITY_POS[city];
      return { m, i, pos };
    })
    .filter(({ pos }) => !!pos);

  if (pinsWithPos.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Where Your Matches Are</Text>

      {/* Map canvas */}
      <View style={styles.mapContainer}>
        {/* Faint city-name labels */}
        {Object.entries(CITY_POS).map(([city, [left, top]]) => (
          <Text
            key={city}
            style={[
              styles.cityLabel,
              { left: `${left}%` as any, top: `${top + 5}%` as any },
            ]}
          >
            {city.charAt(0).toUpperCase() + city.slice(1)}
          </Text>
        ))}

        {/* User's own pin (gold star) */}
        {userPos && (
          <View
            style={[
              styles.pin,
              styles.userPin,
              { left: `${userPos[0]}%` as any, top: `${userPos[1]}%` as any },
            ]}
          >
            <Text style={styles.userPinText}>★</Text>
          </View>
        )}

        {/* Match pins */}
        {pinsWithPos.map(({ m, i, pos }) => {
          const [left, top] = pos!;
          const color = PIN_COLORS[i % PIN_COLORS.length];
          return (
            <View
              key={i}
              style={[
                styles.pin,
                {
                  left: `${left}%` as any,
                  top: `${top}%` as any,
                  backgroundColor: color,
                },
              ]}
            >
              <Text style={styles.pinText}>{m.name[0]}</Text>
            </View>
          );
        })}

        <Text style={styles.metroLabel}>Atlanta Metro</Text>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {userPos && (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.userLegendDot]}>
              <Text style={styles.userLegendStar}>★</Text>
            </View>
            <Text style={[styles.legendText, { fontWeight: "700" }]}>You</Text>
          </View>
        )}
        {matches.map((m, i) => (
          <View key={i} style={styles.legendRow}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: PIN_COLORS[i % PIN_COLORS.length] },
              ]}
            />
            <Text style={styles.legendText}>
              {m.name} · {m.location
                ? m.location.charAt(0).toUpperCase() + m.location.slice(1)
                : "Atlanta"}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A2E",
    marginBottom: 12,
  },
  mapContainer: {
    width: "100%",
    height: 220,
    backgroundColor: "#C8DEAA",   // soft terrain green
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#A8C890",
  },
  cityLabel: {
    position: "absolute",
    fontSize: 9,
    color: "#5A7A5A",
    fontStyle: "italic",
    // nudge label left so it roughly centres under its coordinate
    transform: [{ translateX: -18 }],
  },
  pin: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
    // Centre the pin circle on the coordinate
    marginLeft: -17,
    marginTop: -17,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  pinText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  userPin: {
    backgroundColor: "#F4C430",
    borderColor: "#fff",
    zIndex: 10,
  },
  userPinText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  userLegendDot: {
    backgroundColor: "#F4C430",
    alignItems: "center",
    justifyContent: "center",
  },
  userLegendStar: {
    fontSize: 8,
    color: "#fff",
  },
  metroLabel: {
    position: "absolute",
    bottom: 8,
    right: 12,
    fontSize: 11,
    color: "#7A9A7A",
    fontStyle: "italic",
  },
  legend: {
    marginTop: 10,
    backgroundColor: "#EDF5E5",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: "#444",
  },
});
