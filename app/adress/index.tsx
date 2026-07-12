import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";

const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type AddressState = {
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  lat: string;
  lng: string;
};

export default function AddressProfileScreen() {
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [saving, setSaving] = useState(false);

  const [address, setAddress] = useState<AddressState>({
    fullAddress: "",
    city: "",
    state: "",
    pincode: "",
    landmark: "",
    lat: "",
    lng: "",
  });

  useEffect(() => {
    askLocationAndFetch();
  }, []);

  const askLocationAndFetch = async () => {
    try {
      setLoadingLocation(true);

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Location permission denied",
          "You can still enter address manually."
        );
        setLoadingLocation(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lat = String(loc.coords.latitude);
      const lng = String(loc.coords.longitude);

      setAddress((prev) => ({
        ...prev,
        lat,
        lng,
      }));

      await reverseGeocode(lat, lng);
    } catch (err) {
      console.log("Location fetch error:", err);
      Alert.alert("Error", "Could not fetch current location.");
    } finally {
      setLoadingLocation(false);
    }
  };

  const reverseGeocode = async (lat: string, lng: string) => {
    try {
      if (!LOCATIONIQ_KEY) {
        Alert.alert("Missing key", "LocationIQ key not found in .env");
        return;
      }

      const url =
        `https://api.locationiq.com/v1/reverse` +
        `?key=${LOCATIONIQ_KEY}` +
        `&lat=${lat}` +
        `&lon=${lng}` +
        `&format=json`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Reverse geocoding failed");
      }

      const addr = data?.address || {};

      setAddress((prev) => ({
        ...prev,
        fullAddress: data?.display_name || "",
        city: addr.city || addr.town || addr.village || "",
        state: addr.state || "",
        pincode: addr.postcode || "",
        landmark:
          addr.road ||
          addr.suburb ||
          addr.neighbourhood ||
          addr.hamlet ||
          "",
      }));
    } catch (err) {
      console.log("Reverse geocode error:", err);
      Alert.alert("Error", "Could not convert location to address.");
    }
  };

  const updateField = (key: keyof AddressState, value: string) => {
    setAddress((prev) => ({ ...prev, [key]: value }));
  };

  const saveAddress = async () => {
    try {
      setSaving(true);

      const payload = {
        fullAddress: address.fullAddress,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark,
        lat: Number(address.lat),
        lng: Number(address.lng),
      };

      console.log("Saving address payload:", payload);

      // Replace this with your real backend endpoint when ready
      if (BACKEND_URL) {
        try {
          const res = await fetch(`${BACKEND_URL}/address`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const text = await res.text();
          console.log("Backend response:", text);
        } catch (e) {
          console.log("Backend save error:", e);
        }
      }

      Alert.alert("Saved", "Address saved successfully.");
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Could not save address.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Your Address</Text>
        <Text style={styles.subtitle}>
          We’ll auto-fetch your current location and fill the address.
        </Text>

        <Pressable style={styles.locationBtn} onPress={askLocationAndFetch}>
          <Text style={styles.locationBtnText}>Use current location</Text>
        </Pressable>

        {loadingLocation ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" />
            <Text style={styles.loaderText}>Fetching current location...</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.label}>Full Address</Text>
          <TextInput
            style={styles.input}
            value={address.fullAddress}
            onChangeText={(v) => updateField("fullAddress", v)}
            placeholder="Full address"
            multiline
          />

          <Text style={styles.label}>Landmark</Text>
          <TextInput
            style={styles.input}
            value={address.landmark}
            onChangeText={(v) => updateField("landmark", v)}
            placeholder="Landmark"
          />

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={address.city}
            onChangeText={(v) => updateField("city", v)}
            placeholder="City"
          />

          <Text style={styles.label}>State</Text>
          <TextInput
            style={styles.input}
            value={address.state}
            onChangeText={(v) => updateField("state", v)}
            placeholder="State"
          />

          <Text style={styles.label}>Pincode</Text>
          <TextInput
            style={styles.input}
            value={address.pincode}
            onChangeText={(v) => updateField("pincode", v)}
            placeholder="Pincode"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Latitude</Text>
          <TextInput
            style={styles.input}
            value={address.lat}
            editable={false}
            placeholder="Latitude"
          />

          <Text style={styles.label}>Longitude</Text>
          <TextInput
            style={styles.input}
            value={address.lng}
            editable={false}
            placeholder="Longitude"
          />

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveAddress}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Saving..." : "Save Address"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  container: { padding: 16, paddingBottom: 40 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginTop: 10,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  locationBtn: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  locationBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  loaderWrap: {
    marginTop: 18,
    alignItems: "center",
  },
  loaderText: {
    marginTop: 8,
    color: "#6B7280",
  },
  card: {
    marginTop: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fff",
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: "#111827",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});