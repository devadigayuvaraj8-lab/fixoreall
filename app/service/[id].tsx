import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

type Service = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  base_price: number;
  color: string;
  description: string;
};

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [svc, setSvc] = useState<Service | null>(null);
  const [address, setAddress] = useState("Flat 401, Sunshine Apartments, MG Road");
  const [notes, setNotes] = useState("");
  const [useWallet, setUseWallet] = useState(false);
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setSvc(await api<Service>(`/services/${id}`)); } catch (e: any) { setError(e.message); }
    })();
  }, [id]);

  if (!svc) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  const base = svc.base_price;
  const discount = applyDiscount ? 50 : 0;
  const walletAmt = useWallet ? Math.min(user?.wallet_balance || 0, Math.max(0, base - discount)) : 0;
  const total = Math.max(0, base - discount - walletAmt);

  const book = async () => {
    setBusy(true);
    setError(null);
    try {
      const b = await api<{ id: string }>("/bookings", {
        method: "POST",
        body: {
          service_id: svc.id,
          address,
          lat: 12.9716,
          lng: 77.5946,
          notes,
          use_wallet: useWallet,
          apply_referral_discount: applyDiscount,
        },
      });
      await refresh();
      router.replace({ pathname: "/booking/[id]", params: { id: b.id } });
    } catch (e: any) {
      setError(e.message || "Booking failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{svc.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 200 }}>
        <Image
          source={{ uri: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=800&q=80&auto=format" }}
          style={styles.hero}
          contentFit="cover"
        />
        <View style={{ padding: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[styles.emojiBox, { backgroundColor: svc.color + "1A" }]}>
              <Text style={{ fontSize: 28 }}>{svc.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>{svc.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>4.8 · 1.2k bookings</Text>
              </View>
            </View>
            <Text style={styles.price}>₹{svc.base_price}</Text>
          </View>

          <Text style={{ marginTop: spacing.md, color: colors.textSecondary, lineHeight: 22 }}>{svc.description}</Text>

          <View style={styles.featuresRow}>
            <Feature icon="checkmark-circle" label="Verified pros" />
            <Feature icon="time" label="2-hr arrival" />
            <Feature icon="shield-checkmark" label="30-day warranty" />
          </View>

          <Text style={[font.h4, { marginTop: spacing.xl }]}>Service Address</Text>
          <View style={styles.inputBox}>
            <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
            <TextInput
              testID="address-input"
              value={address}
              onChangeText={setAddress}
              placeholder="Full address"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
            />
          </View>

          <Text style={[font.h4, { marginTop: spacing.lg }]}>Notes for technician</Text>
          <View style={styles.inputBox}>
            <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
            <TextInput
              testID="notes-input"
              value={notes}
              onChangeText={setNotes}
              placeholder="Describe the issue (optional)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
            />
          </View>

          {/* discounts */}
          <View style={styles.discRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>Apply referral discount</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>₹50 off (first booking only)</Text>
            </View>
            <Switch
              testID="discount-switch"
              value={applyDiscount}
              onValueChange={setApplyDiscount}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.discRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: colors.text }}>Use wallet balance</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>Available: ₹{(user?.wallet_balance || 0).toFixed(2)}</Text>
            </View>
            <Switch
              testID="wallet-switch"
              value={useWallet}
              onValueChange={setUseWallet}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#fff"
            />
          </View>

          {error ? <Text style={{ color: colors.danger, marginTop: 10 }}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>Total</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={styles.totalPrice}>₹{total}</Text>
            {(discount + walletAmt) > 0 && <Text style={{ fontSize: 12, color: colors.success, fontWeight: "700" }}>−₹{discount + walletAmt}</Text>}
          </View>
        </View>
        <TouchableOpacity
          testID="book-now-button"
          style={[styles.bookBtn, busy && { opacity: 0.7 }]}
          onPress={book}
          disabled={busy}
          activeOpacity={0.9}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.bookText}>Book Now</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Feature({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.feat}>
      <Ionicons name={icon} size={18} color={colors.success} />
      <Text style={styles.featText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  headerTitle: { ...font.h4 },
  hero: { width: "100%", height: 180 },
  emojiBox: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  price: { fontSize: 22, fontWeight: "800", color: colors.text },
  featuresRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg, gap: 8 },
  feat: { flex: 1, alignItems: "center", backgroundColor: "#fff", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft },
  featText: { fontSize: 11, color: colors.text, marginTop: 6, fontWeight: "600", textAlign: "center" },
  inputBox: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, gap: 8, backgroundColor: "#fff", marginTop: 8 },
  input: { flex: 1, fontSize: 15, color: colors.text, minHeight: 22 },
  discRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderSoft, marginTop: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.xl, gap: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  totalPrice: { fontSize: 22, fontWeight: "800", color: colors.text },
  bookBtn: { backgroundColor: colors.accent, paddingHorizontal: 22, paddingVertical: 14, borderRadius: radius.md, flexDirection: "row", alignItems: "center", gap: 8 },
  bookText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
