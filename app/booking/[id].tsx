import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colors, shadow } from "@/src/lib/theme";
import { getCurrentAddress } from "@/src/lib/location";

const LOCATION_CACHE_KEY = "fixo_current_location";

export default function BookingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    name?: string;
    emoji?: string;
    price?: string;
  }>();

  const serviceName = params.name || "Service";
  const serviceEmoji = params.emoji || "🛠️";
  const basePrice = Number(params.price || 499);

  const [address, setAddress] = useState("Fetching your current address...");
  const [notes, setNotes] = useState("");
  const [loadingAddress, setLoadingAddress] = useState(true);
  const [referral, setReferral] = useState(false);
  const [wallet, setWallet] = useState(false);

  useEffect(() => {
    loadAddress();
  }, []);

  const loadAddress = async () => {
    try {
      setLoadingAddress(true);

      const cached = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.fullAddress) {
          setAddress(parsed.fullAddress);
        }
      }

      const current = await getCurrentAddress();
      setAddress(current.fullAddress || current.shortAddress || "Current Location");

      await AsyncStorage.setItem(
        LOCATION_CACHE_KEY,
        JSON.stringify(current)
      );
    } catch (err: any) {
      console.log("Booking location error:", err);

      if (err?.message === "LOCATION_PERMISSION_DENIED") {
        Alert.alert(
          "Location permission denied",
          "Allow location access to auto-fill the booking address."
        );
      } else if (err?.message === "LOCATIONIQ_KEY_MISSING") {
        Alert.alert(
          "Missing LocationIQ key",
          "EXPO_PUBLIC_LOCATIONIQ_KEY is missing in your frontend .env file."
        );
      }

      if (!address || address === "Fetching your current address...") {
        setAddress("Enter your service address manually");
      }
    } finally {
      setLoadingAddress(false);
    }
  };

  const total = useMemo(() => {
    let amount = basePrice;
    if (referral) amount -= 50;
    if (amount < 0) amount = 0;
    return amount;
  }, [basePrice, referral]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{serviceName}</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.featureRow}>
          <View style={styles.featureCard}>
            <Ionicons name="checkmark-circle" size={22} color="#10B981" />
            <Text style={styles.featureText}>Verified pros</Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="time" size={22} color="#10B981" />
            <Text style={styles.featureText}>2-hr arrival</Text>
          </View>
          <View style={styles.featureCard}>
            <Ionicons name="shield-checkmark" size={22} color="#10B981" />
            <Text style={styles.featureText}>30-day warranty</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Service Address</Text>
        <View style={styles.addressCard}>
          <Ionicons name="location-outline" size={24} color="#64748B" style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            {loadingAddress ? (
              <View style={styles.addressLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.addressText}>Fetching your current location...</Text>
              </View>
            ) : (
              <TextInput
                value={address}
                onChangeText={setAddress}
                multiline
                style={styles.addressInput}
                placeholder="Enter your address"
                placeholderTextColor="#94A3B8"
              />
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notes for technician</Text>
        <View style={styles.notesCard}>
          <Ionicons name="create-outline" size={24} color="#64748B" style={{ marginTop: 4 }} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Describe the issue (optional)"
            placeholderTextColor="#94A3B8"
            multiline
            style={styles.notesInput}
          />
        </View>

        <View style={styles.optionCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Apply referral discount</Text>
            <Text style={styles.optionSub}>₹50 off (first booking only)</Text>
          </View>
          <Switch value={referral} onValueChange={setReferral} />
        </View>

        <View style={styles.optionCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Use wallet balance</Text>
            <Text style={styles.optionSub}>Available: ₹0.00</Text>
          </View>
          <Switch value={wallet} onValueChange={setWallet} />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>₹{total}</Text>
        </View>

        <TouchableOpacity
          style={styles.bookBtn}
          onPress={() => {
            Alert.alert(
              "Booking ready",
              `Service: ${serviceName}\nAddress: ${address}\nNotes: ${notes || "None"}`
            );
          }}
        >
          <Text style={styles.bookBtnText}>Book Now</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },

  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 28,
  },
  featureCard: {
    width: "31.5%",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  featureText: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },

  addressCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  addressLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  addressText: {
    fontSize: 16,
    color: "#0F172A",
    flexShrink: 1,
  },
  addressInput: {
    minHeight: 74,
    fontSize: 16,
    color: "#0F172A",
    padding: 0,
    textAlignVertical: "top",
  },

  notesCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  notesInput: {
    flex: 1,
    minHeight: 74,
    marginLeft: 14,
    fontSize: 16,
    color: "#0F172A",
    padding: 0,
    textAlignVertical: "top",
  },

  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 18,
    paddingVertical: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  optionSub: {
    marginTop: 6,
    fontSize: 14,
    color: "#64748B",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 16,
    color: "#94A3B8",
  },
  totalAmount: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "900",
    color: "#0F172A",
  },
  bookBtn: {
    backgroundColor: "#F97316",
    minWidth: 180,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    ...shadow.card,
  },
  bookBtnText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
});