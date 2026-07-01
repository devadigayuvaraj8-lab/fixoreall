import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator, RefreshControl, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { colors, font, radius, spacing, shadow, STATUS_LABEL, STATUS_COLOR } from "@/src/lib/theme";
import { api, wsUrl } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { OfferModal } from "@/src/components/OfferModal";
import { ActionsSheet } from "@/src/components/ActionsSheet";

type Job = {
  id: string;
  service_name: string;
  service_emoji: string;
  status: string;
  total: number;
  base_price: number;
  customer_name?: string;
  address: string;
  lat: number;
  lng: number;
  notes?: string;
  eta_minutes?: number;
  delay_reason?: string | null;
  delay_minutes?: number;
};

export default function TechHome() {
  const { user, refresh } = useAuth();
  const [online, setOnline] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ booking: Job; expires_in: number } | null>(null);
  const [actionsFor, setActionsFor] = useState<{ id: string; mode: "quit" | "delay" } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "ok" | "denied">("idle");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => { setOnline(!!user?.is_online); }, [user?.is_online]);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api<Job[]>("/technician/jobs");
      setJobs(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const pollOffer = useCallback(async () => {
    try {
      const r = await api<{ offer: Job | null; expires_in?: number }>("/technician/offer");
      if (r.offer) setOffer({ booking: r.offer, expires_in: r.expires_in || 30 });
      else setOffer(null);
    } catch {}
  }, []);

  // GPS: ask for permission, capture, push to server
  const captureLocation = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocStatus("denied");
        // Fallback to a default city center
        return { lat: 12.9716, lng: 77.5946 };
      }
      setLocStatus("ok");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return { lat: 12.9716, lng: 77.5946 };
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadJobs();
    pollOffer();
    const t1 = setInterval(loadJobs, 6000);
    const t2 = setInterval(pollOffer, 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [loadJobs, pollOffer]));

  // Open WebSocket to receive instant new offer pushes
  useEffect(() => {
    if (!user || !online) {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      return;
    }
    let cancelled = false;
    const connect = () => {
      if (cancelled) return;
      try {
        const ws = new WebSocket(wsUrl(`/ws/technician/${user.id}`));
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "new_offer" && msg.booking) {
              setOffer({ booking: msg.booking, expires_in: msg.expires_in || 30 });
            } else if (msg.type === "job_taken") {
              setOffer((cur) => (cur && cur.booking.id === msg.booking_id ? null : cur));
            }
          } catch {}
        };
        ws.onclose = () => {
          if (!cancelled) setTimeout(connect, 2000);
        };
      } catch {
        if (!cancelled) setTimeout(connect, 2000);
      }
    };
    connect();
    return () => { cancelled = true; try { wsRef.current?.close(); } catch {} };
  }, [user, online]);

  // Periodic GPS update while online (every 20s)
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const update = async () => {
      const loc = await captureLocation();
      if (!alive || !loc) return;
      try { await api("/technician/location", { method: "PATCH", body: loc }); } catch {}
    };
    update();
    const t = setInterval(update, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [online, captureLocation]);

  const toggle = async (val: boolean) => {
    setOnline(val);
    try {
      let loc: { lat: number; lng: number } | null = null;
      if (val) loc = await captureLocation();
      await api("/technician/availability", { method: "PATCH", body: { is_online: val, ...(loc || {}) } });
      await refresh();
    } catch {
      setOnline(!val);
    }
  };

  const updateStatus = async (jobId: string, status: string) => {
    setBusyId(jobId);
    try {
      await api(`/bookings/${jobId}/status`, { method: "PATCH", body: { status } });
      await loadJobs();
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const active = jobs.filter((j) => ["accepted", "on_the_way", "started"].includes(j.status));
  const completed = jobs.filter((j) => j.status === "completed").length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadJobs(); }} tintColor={colors.accent} />}
      >
        <LinearGradient colors={online ? ["#10B981", "#059669"] : ["#0F172A", "#1E293B"]} style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTag}>{online ? "ACTIVE · ACCEPTING JOBS" : "OFFLINE"}</Text>
            <Text style={styles.bannerTitle}>{online ? "You're online" : "Go online to receive jobs"}</Text>
            <Text style={styles.bannerSub}>
              {online
                ? (locStatus === "denied" ? "⚠ Using default location (GPS denied)" : `${active.length} active · GPS live`)
                : "Toggle on to start earning"}
            </Text>
          </View>
          <Switch
            testID="online-toggle"
            value={online}
            onValueChange={toggle}
            trackColor={{ true: "#fff", false: "#475569" }}
            thumbColor={online ? colors.success : "#cbd5e1"}
          />
        </LinearGradient>

        <View style={styles.statsRow}>
          <Stat label="Active" value={String(active.length)} icon="flash" />
          <Stat label="Completed" value={String(completed)} icon="checkmark-done" />
          <Stat label="Rating" value={(user?.rating || 4.8).toFixed(1)} icon="star" />
        </View>

        {/* Active jobs */}
        <Text style={styles.section}>Active jobs</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : active.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="briefcase-outline" size={36} color={colors.textMuted} />
            <Text style={{ marginTop: 8, fontWeight: "700", color: colors.text }}>{online ? "Waiting for new jobs..." : "Go online to see jobs"}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: "center" }}>
              {online ? "We'll send you a job offer when one comes in your area." : "Toggle the switch above to start receiving offers."}
            </Text>
          </View>
        ) : (
          active.map((j) => (
            <View key={j.id} style={styles.jobCard}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 28 }}>{j.service_emoji}</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.jobTitle}>{j.service_name}</Text>
                  <Text style={styles.jobAddr} numberOfLines={1}>{j.customer_name} · {j.address}</Text>
                  {j.eta_minutes ? <Text style={styles.eta}>⏱ ETA {j.eta_minutes} min</Text> : null}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[j.status] + "22" }]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: STATUS_COLOR[j.status] }}>{STATUS_LABEL[j.status]}</Text>
                </View>
              </View>

              {j.delay_reason ? (
                <View style={styles.delayBanner}>
                  <Ionicons name="warning" size={14} color={colors.warning} />
                  <Text style={{ flex: 1, fontSize: 12, color: colors.text, marginLeft: 6 }}>
                    Delay reported: {j.delay_reason} (+{j.delay_minutes}m)
                  </Text>
                </View>
              ) : null}

              <View style={styles.primaryRow}>
                {j.status === "accepted" && (
                  <TouchableOpacity testID={`ontheway-${j.id}`} style={styles.primaryBtn} onPress={() => updateStatus(j.id, "on_the_way")}>
                    <Ionicons name="car" size={16} color="#fff" />
                    <Text style={styles.primaryText}>On the Way</Text>
                  </TouchableOpacity>
                )}
                {j.status === "on_the_way" && (
                  <TouchableOpacity testID={`start-${j.id}`} style={styles.primaryBtn} onPress={() => updateStatus(j.id, "started")}>
                    <Ionicons name="play" size={16} color="#fff" />
                    <Text style={styles.primaryText}>Start Service</Text>
                  </TouchableOpacity>
                )}
                {j.status === "started" && (
                  <TouchableOpacity testID={`complete-${j.id}`} style={[styles.primaryBtn, { backgroundColor: colors.success }]} onPress={() => updateStatus(j.id, "completed")}>
                    <Ionicons name="checkmark-done" size={16} color="#fff" />
                    <Text style={styles.primaryText}>Mark Completed</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.secondaryRow}>
                <TouchableOpacity testID={`delay-${j.id}`} style={styles.smallBtn} onPress={() => setActionsFor({ id: j.id, mode: "delay" })}>
                  <Ionicons name="time-outline" size={14} color={colors.warning} />
                  <Text style={[styles.smallText, { color: colors.warning }]}>Report Delay</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`quit-${j.id}`} style={styles.smallBtn} onPress={() => setActionsFor({ id: j.id, mode: "quit" })}>
                  <Ionicons name="exit-outline" size={14} color={colors.danger} />
                  <Text style={[styles.smallText, { color: colors.danger }]}>Quit Job</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <OfferModal
        visible={!!offer}
        offer={offer?.booking || null}
        expiresIn={offer?.expires_in || 30}
        onDone={() => { setOffer(null); loadJobs(); }}
      />

      {actionsFor && (
        <ActionsSheet
          bookingId={actionsFor.id}
          mode={actionsFor.mode}
          visible
          onClose={() => setActionsFor(null)}
          onDone={() => { setActionsFor(null); loadJobs(); }}
        />
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statIcon}><Ionicons name={icon} size={16} color={colors.accent} /></View>
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.xl, padding: spacing.lg, flexDirection: "row", alignItems: "center", ...shadow.pop },
  bannerTag: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  bannerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 4 },
  bannerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  statIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 22, fontWeight: "800", color: colors.text, marginTop: 8 },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  section: { ...font.h4, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyCard: { marginHorizontal: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft },
  jobCard: { marginHorizontal: spacing.lg, marginBottom: 12, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  jobTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  jobAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  eta: { fontSize: 11, color: colors.accent, fontWeight: "700", marginTop: 4 },
  delayBanner: { marginTop: 10, flexDirection: "row", alignItems: "center", backgroundColor: colors.warning + "11", padding: 8, borderRadius: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  primaryRow: { marginTop: 12 },
  primaryBtn: { paddingVertical: 14, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: colors.primary },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  smallBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: "#fff" },
  smallText: { fontSize: 12, fontWeight: "700" },
});
