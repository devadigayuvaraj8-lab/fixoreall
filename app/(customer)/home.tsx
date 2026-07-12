import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { getCurrentAddress } from "@/src/lib/location";

const LOCATION_CACHE_KEY = "fixo_current_location";

const SERVICES = [
  { key: "carpenter", name: "Carpenter", emoji: "🪚", price: 299 },
  { key: "painter", name: "Painter", emoji: "🎨", price: 1499 },
  { key: "appliance", name: "Appliance Repair", emoji: "📺", price: 349 },
  { key: "pest", name: "Pest Control", emoji: "🐜", price: 799 },
  { key: "electrician", name: "Electrician", emoji: "⚡", price: 199 },
  { key: "plumber", name: "Plumber", emoji: "🔧", price: 249 },
  { key: "cleaning", name: "Home Cleaning", emoji: "🧹", price: 399 },
  { key: "ac", name: "AC Repair", emoji: "❄️", price: 499 },
];

export default function CustomerHome() {
  const router = useRouter();

  const [locationLabel, setLocationLabel] = useState("Fetching location...");
  const [loadingLocation, setLoadingLocation] = useState(true);

  useEffect(() => {
    fetchHomeLocation();
  }, []);

  const fetchHomeLocation = async () => {
    try {
      setLoadingLocation(true);

      const address = await getCurrentAddress();

      setLocationLabel(address.shortAddress || "Current Location");

      await AsyncStorage.setItem(
        LOCATION_CACHE_KEY,
        JSON.stringify(address)
      );
    } catch (err: any) {
      console.log("Home location error:", err);

      if (err?.message === "LOCATION_PERMISSION_DENIED") {
        setLocationLabel("Location permission denied");
        Alert.alert(
          "Location permission denied",
          "Allow location access to auto-fill your address and find nearby technicians."
        );
      } else if (err?.message === "LOCATIONIQ_KEY_MISSING") {
        setLocationLabel("Location unavailable");
        Alert.alert(
          "Missing LocationIQ key",
          "EXPO_PUBLIC_LOCATIONIQ_KEY is missing in your frontend .env file."
        );
      } else {
        setLocationLabel("Location unavailable");
      }
    } finally {
      setLoadingLocation(false);
    }
  };

  const openService = (service: (typeof SERVICES)[number]) => {
    router.push({
      pathname: "/booking/[id]",
      params: {
        id: service.key,
        name: service.name,
        emoji: service.emoji,
        price: String(service.price),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greet}>Hi, Yuvarajdevadiga41 👋</Text>

            <View style={styles.locationRow}>
              <Ionicons name="location" size={16} color={colors.accent} />
              {loadingLocation ? (
                <View style={styles.locationLoadingWrap}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={styles.locationText}>Fetching location...</Text>
                </View>
              ) : (
                <Text style={styles.locationText} numberOfLines={1}>
                  {locationLabel}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>Y</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.searchBox}
          onPress={() => {}}
        >
          <Ionicons name="search" size={22} color={colors.textMuted} />
          <Text style={styles.searchText}>Search 'AC repair', 'plumber'...</Text>
        </TouchableOpacity>

        <View style={styles.offerCard}>
          <Text style={styles.offerTag}>FIRST BOOKING</Text>
          <View style={styles.offerRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.offerTitle}>Get ₹50 off your first service</Text>
              <Text style={styles.offerSub}>
                Verified pros • 2-hour response • Cash or wallet
              </Text>
            </View>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeMain}>50%</Text>
              <Text style={styles.offerBadgeSub}>OFF</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Browse services</Text>

        <View style={styles.grid}>
          {SERVICES.map((service) => (
            <TouchableOpacity
              key={service.key}
              style={styles.serviceCard}
              activeOpacity={0.9}
              onPress={() => openService(service)}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.emoji}>{service.emoji}</Text>
              </View>
              <Text style={styles.serviceName} numberOfLines={1}>
                {service.name}
              </Text>
              <Text style={styles.servicePrice}>from ₹{service.price}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { padding: 18, paddingBottom: 30 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  greet: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
  },
  locationRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationLoadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  locationText: {
    fontSize: 15,
    color: "#64748B",
    flexShrink: 1,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  avatarText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },

  searchBox: {
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchText: {
    color: "#94A3B8",
    fontSize: 16,
  },

  offerCard: {
    marginTop: 26,
    backgroundColor: "#0F172A",
    borderRadius: 22,
    padding: 18,
    ...shadow.card,
  },
  offerTag: {
    color: "#F97316",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  offerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
  },
  offerSub: {
    marginTop: 10,
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 20,
  },
  offerBadge: {
    width: 108,
    height: 108,
    borderRadius: 22,
    backgroundColor: "rgba(249,115,22,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerBadgeMain: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
  },
  offerBadgeSub: {
    color: "#FACC15",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },

  sectionTitle: {
    marginTop: 28,
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  serviceCard: {
    width: "30.8%",
    marginBottom: 18,
  },
  iconWrap: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8EEDC",
    marginBottom: 10,
  },
  emoji: {
    fontSize: 36,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  servicePrice: {
    marginTop: 4,
    fontSize: 13,
    color: "#94A3B8",
  },
});