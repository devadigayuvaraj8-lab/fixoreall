import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors, font, radius, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

type Offer = {
  id: string;
  service_name: string;
  service_emoji: string;
  base_price: number;
  address: string;
  notes?: string;
  customer_name?: string;
  eta_minutes?: number;
};

export function OfferModal({
  offer,
  expiresIn,
  onDone,
  visible,
}: {
  offer: Offer | null;
  expiresIn: number;
  onDone: () => void;
  visible: boolean;
}) {
  const [secs, setSecs] = useState(expiresIn);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const pulse = useSharedValue(1);

  useEffect(() => { setSecs(expiresIn); }, [expiresIn, offer?.id]);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    pulse.value = withRepeat(withTiming(1.15, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => clearInterval(t);
  }, [visible, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const respond = async (accept: boolean) => {
    if (!offer) return;
    setBusy(accept ? "accept" : "reject");
    try {
      await api(`/technician/offer/${offer.id}/respond`, { method: "POST", body: { accept } });
      onDone();
    } catch {
    } finally {
      setBusy(null);
    }
  };

  if (!offer) return null;
  const earn = Math.round((offer.base_price || 0) * 0.85);
  const pct = Math.max(0, Math.min(1, secs / 30));

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.backdrop}>
        <View style={s.sheet} testID="offer-modal">
          <Animated.View style={[s.pulse, pulseStyle]} />
          <View style={s.header}>
            <Text style={s.tag}>NEW JOB OFFER</Text>
            <View style={s.timerBox}>
              <Ionicons name="time" size={14} color={colors.danger} />
              <Text style={s.timer}>{secs}s</Text>
            </View>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: pct > 0.4 ? colors.success : pct > 0.2 ? colors.warning : colors.danger }]} />
          </View>

          <View style={s.row}>
            <View style={s.emojiBox}><Text style={{ fontSize: 32 }}>{offer.service_emoji}</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.title}>{offer.service_name}</Text>
              <Text style={s.addr} numberOfLines={2}>📍 {offer.address}</Text>
              {offer.customer_name && <Text style={s.cust}>Customer: {offer.customer_name}</Text>}
            </View>
            <View style={s.earnBox}>
              <Text style={s.earnAmt}>₹{earn}</Text>
              <Text style={s.earnTag}>YOU EARN</Text>
            </View>
          </View>

          {offer.notes ? <Text style={s.notes}>📝 {offer.notes}</Text> : null}

          <View style={s.actions}>
            <TouchableOpacity
              testID="offer-reject"
              style={s.rejectBtn}
              onPress={() => respond(false)}
              disabled={!!busy}
            >
              {busy === "reject" ? <ActivityIndicator color={colors.danger} /> : (
                <>
                  <Ionicons name="close" size={20} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontWeight: "700" }}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              testID="offer-accept"
              style={s.acceptBtn}
              onPress={() => respond(true)}
              disabled={!!busy}
            >
              {busy === "accept" ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Accept Job</Text>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.65)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, ...shadow.pop },
  pulse: { position: "absolute", top: 12, alignSelf: "center", width: 60, height: 6, borderRadius: 3, backgroundColor: colors.accent + "55" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  tag: { color: colors.accent, fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  timerBox: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.danger + "11", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  timer: { color: colors.danger, fontWeight: "800", fontSize: 13 },
  barTrack: { height: 6, backgroundColor: colors.chip, borderRadius: 3, marginTop: 10, overflow: "hidden" },
  barFill: { height: 6 },
  row: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  emojiBox: { width: 64, height: 64, borderRadius: 16, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" },
  title: { ...font.h3, color: colors.text },
  addr: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  cust: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  earnBox: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  earnAmt: { color: "#fff", fontWeight: "800", fontSize: 18 },
  earnTag: { color: "#fed7aa", fontSize: 9, fontWeight: "700", marginTop: 2 },
  notes: { marginTop: 14, fontSize: 13, color: colors.textSecondary, backgroundColor: colors.chip, padding: 12, borderRadius: 10 },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  rejectBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderWidth: 1.5, borderColor: colors.danger + "44", backgroundColor: "#fff" },
  acceptBtn: { flex: 2, paddingVertical: 16, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: colors.primary },
});
