import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSpring, Easing } from "react-native-reanimated";
import { colors, font, radius, spacing, shadow, STATUS_LABEL, STATUS_COLOR } from "@/src/lib/theme";
import { api, wsUrl } from "@/src/lib/api";

type Booking = {
  id: string;
  service_name: string;
  service_emoji: string;
  status: string;
  total: number;
  base_price: number;
  discount: number;
  wallet_used: number;
  technician_id?: string | null;
  technician_name?: string | null;
  technician_lat?: number | null;
  technician_lng?: number | null;
  address: string;
  lat: number;
  lng: number;
  created_at: string;
  customer_name?: string;
  notes?: string;
  eta_minutes?: number;
  delay_reason?: string | null;
  delay_minutes?: number;
  dispatch_attempts?: number;
};

const PIPELINE = ["pending", "accepted", "on_the_way", "started", "completed"];

export default function BookingTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const pulse = useSharedValue(1);
  const techX = useSharedValue(0.6);
  const techY = useSharedValue(0.3);
  const wsRef = useRef<WebSocket | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Booking>(`/bookings/${id}`);
      setB(r);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.6, { duration: 1400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);

  // Project tech lat/lng to a 0..1 position on the map relative to customer.
  // Customer is anchored at (0.30, 0.62). Tech offset is computed from delta lat/lng with a small max-clamp so they always stay visible while moving in.
  const techPos = (() => {
    if (!b || !b.technician_lat || !b.technician_lng) return { x: 0.6, y: 0.3 };
    const dLat = (b.technician_lat - b.lat);
    const dLng = (b.technician_lng - b.lng);
    // ~ 0.04 deg ≈ 4-5 km. Scale and clamp to keep marker on-map.
    const scale = 6; // higher = more zoom
    let dx = -dLng * scale; // east is +x in map; we invert because tech is "north-east"
    let dy = -dLat * scale;
    // clamp
    dx = Math.max(-0.35, Math.min(0.35, dx));
    dy = Math.max(-0.35, Math.min(0.35, dy));
    return { x: 0.30 + dx, y: 0.62 + dy };
  })();

  // animate tech marker toward computed pos
  useEffect(() => {
    if (!b) return;
    techX.value = withTiming(techPos.x, { duration: 1200, easing: Easing.out(Easing.cubic) });
    techY.value = withTiming(techPos.y, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [techPos.x, techPos.y, b, techX, techY]);

  useFocusEffect(useCallback(() => {
    load();
    try {
      const ws = new WebSocket(wsUrl(`/ws/booking/${id}`));
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.booking) setB(msg.booking);
          if (msg.type === "tech_quit") setToast(`Technician dropped: ${msg.reason}. Finding another nearby…`);
          if (msg.type === "delay") setToast(`Delay reported: ${msg.reason}. ETA +${msg.minutes} min.`);
          if (msg.type === "accepted") setToast("Technician accepted your job! 🎉");
          if (msg.type === "dispatching") setToast("Finding the nearest technician…");
          if (msg.type === "no_techs_available") setToast("No technicians available right now. We'll keep trying.");
          if (msg.type === "location") {
            setB((prev) => prev ? { ...prev, technician_lat: msg.lat, technician_lng: msg.lng } : prev);
          }
        } catch {}
      };
    } catch {}
    const t = setInterval(load, 4000);
    return () => {
      clearInterval(t);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [id, load]));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: 2 - pulse.value }));
  const techPinStyle = useAnimatedStyle(() => ({
    top: `${techY.value * 100}%`,
    left: `${techX.value * 100}%`,
  }));

  const cancel = async () => {
    try {
      await api(`/bookings/${id}/status`, { method: "PATCH", body: { status: "cancelled" } });
      await load();
    } catch {}
  };

  if (loading || !b) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const isSearching = b.status === "pending" || b.status === "dispatching";
  const isFinal = b.status === "completed" || b.status === "cancelled";
  const hasTech = !!b.technician_name && !isSearching;
  const stepIdx = PIPELINE.indexOf(b.status === "dispatching" ? "pending" : b.status);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/(customer)/bookings")} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Tracking</Text>
        <View style={{ width: 40 }} />
      </View>

      {toast ? (
        <View style={styles.toast} testID="toast">
          <Ionicons name="information-circle" size={16} color="#fff" />
          <Text style={{ color: "#fff", flex: 1, fontSize: 13, marginLeft: 6 }}>{toast}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Map */}
        <LinearGradient colors={["#E0E7FF", "#FAE8FF", "#FFEDD5"]} style={styles.mapBox}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 14.28}%` }]} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 16.66}%` }]} />
          ))}
          {/* customer pin */}
          <View style={[styles.pin, { top: "62%", left: "30%" }]}>
            <View style={styles.pinDot}><Ionicons name="home" size={14} color="#fff" /></View>
            <Text style={styles.pinLabel}>You</Text>
          </View>
          {/* technician pin (animated bike) */}
          {hasTech && !isFinal && (
            <Animated.View style={[styles.pin, techPinStyle]}>
              <Animated.View style={[styles.pulseRing, pulseStyle]} />
              <View style={styles.bikeBox}>
                <Text style={{ fontSize: 18 }}>🛵</Text>
              </View>
              <Text style={styles.pinLabel}>{b.technician_name?.split(" ")[0]}</Text>
            </Animated.View>
          )}
          <View style={styles.etaBox}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[b.status] }]} />
            <Text style={{ fontWeight: "700", color: colors.text, fontSize: 13 }}>
              {STATUS_LABEL[b.status] || b.status}
            </Text>
            {b.eta_minutes && !isFinal && hasTech ? (
              <View style={styles.etaPill}>
                <Ionicons name="time" size={12} color="#fff" />
                <Text style={styles.etaText}>{b.eta_minutes}m</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        {/* Searching state */}
        {isSearching && (
          <View style={styles.searchingCard}>
            <View style={styles.searchSpin}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
            <Text style={{ marginTop: 12, fontWeight: "800", color: colors.text, fontSize: 16 }}>
              {b.status === "dispatching" ? "Offering job to nearest technician…" : "Looking for available technicians…"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: "center" }}>
              {b.dispatch_attempts && b.dispatch_attempts > 1 ? `Attempt #${b.dispatch_attempts} — finding next available pro` : "Usually under 2 minutes"}
            </Text>
          </View>
        )}

        {/* Delay banner */}
        {b.delay_reason && !isFinal ? (
          <View style={styles.delayCard} testID="delay-banner">
            <Ionicons name="warning" size={18} color={colors.warning} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>Delay: {b.delay_reason}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Updated ETA +{b.delay_minutes} min. Your technician will reach you as soon as possible.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Technician Card */}
        {hasTech && (
          <View style={styles.techCard}>
            <View style={styles.techAvatar}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{b.technician_name!.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.techName}>{b.technician_name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                <Ionicons name="star" size={12} color={colors.warning} />
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>4.9 · Verified Pro</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.callBtn} testID="call-tech">
              <Ionicons name="call" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Pipeline */}
        <View style={styles.pipeCard}>
          <Text style={font.h4}>Status</Text>
          {PIPELINE.map((s, i) => {
            const done = stepIdx > i || (s === "completed" && b.status === "completed");
            const active = stepIdx === i && !isFinal;
            return (
              <View key={s} style={styles.pipeRow}>
                <View style={[styles.pipeDot, done && { backgroundColor: colors.accent, borderColor: colors.accent }, active && { backgroundColor: "#fff", borderColor: colors.accent }]}>
                  {done && !active ? <Ionicons name="checkmark" size={12} color="#fff" /> : active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /> : null}
                </View>
                <Text style={[styles.pipeText, done && { color: colors.text, fontWeight: "700" }, active && { color: colors.accent, fontWeight: "700" }]}>
                  {s === "pending" ? "Looking for technician" : STATUS_LABEL[s]}
                </Text>
              </View>
            );
          })}
          {b.status === "cancelled" && (
            <View style={[styles.pipeRow, { marginTop: 8 }]}>
              <View style={[styles.pipeDot, { backgroundColor: colors.danger, borderColor: colors.danger }]}>
                <Ionicons name="close" size={12} color="#fff" />
              </View>
              <Text style={[styles.pipeText, { color: colors.danger, fontWeight: "700" }]}>Cancelled</Text>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={styles.sumCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 24 }}>{b.service_emoji}</Text>
            <Text style={[font.h4, { marginLeft: 8, flex: 1 }]}>{b.service_name}</Text>
          </View>
          <Row label="Service charge" value={`₹${b.base_price}`} />
          {b.discount > 0 && <Row label="Referral discount" value={`−₹${b.discount}`} color={colors.success} />}
          {b.wallet_used > 0 && <Row label="Wallet used" value={`−₹${b.wallet_used}`} color={colors.success} />}
          <View style={styles.divider} />
          <Row label="Total" value={`₹${b.total}`} bold />
          <Text style={{ ...font.tiny, marginTop: 12 }}>ADDRESS</Text>
          <Text style={{ fontSize: 13, color: colors.text, marginTop: 4 }}>{b.address}</Text>
          {b.notes ? (
            <>
              <Text style={{ ...font.tiny, marginTop: 12 }}>NOTES</Text>
              <Text style={{ fontSize: 13, color: colors.text, marginTop: 4 }}>{b.notes}</Text>
            </>
          ) : null}
        </View>

        {!isFinal && (
          <TouchableOpacity testID="cancel-booking" style={styles.cancelBtn} onPress={cancel}>
            <Text style={{ color: colors.danger, fontWeight: "700" }}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: color || colors.text, fontSize: bold ? 16 : 13, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  headerTitle: { ...font.h4 },
  toast: { marginHorizontal: spacing.lg, marginTop: 6, backgroundColor: colors.primary, padding: 12, borderRadius: 12, flexDirection: "row", alignItems: "center", ...shadow.card },
  mapBox: { height: 260, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.lg, overflow: "hidden", position: "relative", ...shadow.card, borderWidth: 1, borderColor: colors.borderSoft },
  gridLineV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(15,23,42,0.05)" },
  gridLineH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(15,23,42,0.05)" },
  pin: { position: "absolute", alignItems: "center" },
  pinDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff" },
  pinLabel: { fontSize: 10, fontWeight: "700", color: colors.text, marginTop: 4, backgroundColor: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pulseRing: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, top: -4, left: -4, opacity: 0.4 },
  bikeBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.accent, ...shadow.card },
  etaBox: { position: "absolute", top: 14, left: 14, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, ...shadow.card },
  dot: { width: 8, height: 8, borderRadius: 4 },
  etaPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginLeft: 6 },
  etaText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  searchingCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: "#fff", padding: spacing.lg, borderRadius: radius.lg, alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  searchSpin: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  delayCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.warning + "11", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning + "44" },
  techCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  techAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  techName: { fontSize: 16, fontWeight: "700", color: colors.text },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  pipeCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  pipeRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 12 },
  pipeDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  pipeText: { fontSize: 14, color: colors.textMuted },
  sumCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginTop: 12 },
  cancelBtn: { marginTop: spacing.md, marginHorizontal: spacing.lg, paddingVertical: 14, alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger + "44", backgroundColor: "#fff" },
});
