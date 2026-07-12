import * as Location from "expo-location";

const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY;

export type CurrentAddress = {
  fullAddress: string;
  shortAddress: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  lat: number;
  lng: number;
};

export async function getCurrentAddress(): Promise<CurrentAddress> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("LOCATION_PERMISSION_DENIED");
  }

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;

  if (!LOCATIONIQ_KEY) {
    throw new Error("LOCATIONIQ_KEY_MISSING");
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

  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.county ||
    "";

  const state = addr.state || "";
  const pincode = addr.postcode || "";

  const landmark =
    addr.road ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.hamlet ||
    "";

  const fullAddress = data?.display_name || "";
  const shortAddress =
    [landmark, city].filter(Boolean).join(", ") ||
    fullAddress ||
    "Current Location";

  return {
    fullAddress,
    shortAddress,
    city,
    state,
    pincode,
    landmark,
    lat,
    lng,
  };
}