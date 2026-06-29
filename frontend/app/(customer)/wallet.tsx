import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useFocusEffect } from "expo-router";

type Tx = { id: string; amount: number; type: string; description: string; created_at: string };
type Referral = { code: string; share_text: string; referred_count: number; rewards_paid: number; total_earned: number };

export default function Wallet() {
  const { user, refresh } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [ref, setRef] = useState<Referral | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
  try {
    const [t, r] = await Promise.all([
      api<any>("/wallet/transactions"),
      api<Referral>("/referral"),
      refresh(),
    ]);

    console.log("Wallet API =", t);

    if (Array.isArray(t)) {
      setTxs(t);
    } else if (Array.isArray(t.transactions)) {
      setTxs(t.transactions);
    } else if (Array.isArray(t.data)) {
      setTxs(t.data);
    } else {
      setTxs([]);
    }

    setRef(r);
  } catch (e) {
    console.log(e);
    setTxs([]);
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    if (!ref) return;
    try { await Share.share({ message: ref.share_text }); } catch {}
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        <Text style={font.h2}>Wallet</Text>

        <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmt} testID="wallet-balance">₹{(user?.wallet_balance || 0).toFixed(2)}</Text>
          <View style={styles.balanceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTag}>Referral earnings</Text>
              <Text style={styles.balanceSub}>₹{ref?.total_earned?.toFixed(2) || "0.00"}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceTag}>Friends referred</Text>
              <Text style={styles.balanceSub}>{ref?.referred_count || 0}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.refCard}>
          <View style={styles.refIcon}><Ionicons name="gift" size={20} color={colors.accent} /></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ ...font.h4 }}>Refer friends, earn ₹50–₹200</Text>
            <Text style={{ ...font.small, marginTop: 2 }}>Your code</Text>
            <Text testID="referral-code" style={styles.refCode}>{ref?.code || user?.referral_code}</Text>
          </View>
          <TouchableOpacity testID="share-referral" style={styles.shareBtn} onPress={share}>
            <Ionicons name="share-social" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Share</Text>
          </TouchableOpacity>
        </View>

        <Text style={[font.h4, { marginTop: spacing.xl, marginBottom: spacing.sm }]}>Recent transactions</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : txs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={36} color={colors.textMuted} />
            <Text style={[font.small, { marginTop: 8 }]}>No transactions yet</Text>
          </View>
        ) : (
          txs.map((t) => (
            <View key={t.id} style={styles.tx} testID={`tx-${t.id}`}>
              <View style={[styles.txIcon, { backgroundColor: (t.amount >= 0 ? colors.success : colors.danger) + "22" }]}>
                <Ionicons name={t.amount >= 0 ? "arrow-down" : "arrow-up"} size={14} color={t.amount >= 0 ? colors.success : colors.danger} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.txTitle} numberOfLines={1}>{t.description}</Text>
                <Text style={styles.txDate}>{new Date(t.created_at).toLocaleDateString()} · {t.type.replace(/_/g, " ")}</Text>
              </View>
              <Text style={[styles.txAmt, { color: t.amount >= 0 ? colors.success : colors.danger }]}>
                {t.amount >= 0 ? "+" : ""}₹{Math.abs(t.amount).toFixed(2)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  balanceCard: { marginTop: spacing.lg, borderRadius: radius.xl, padding: spacing.xl, ...shadow.pop },
  balanceLabel: { color: "#cbd5e1", fontSize: 12, fontWeight: "600", letterSpacing: 1, textTransform: "uppercase" },
  balanceAmt: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 8, letterSpacing: -1 },
  balanceRow: { flexDirection: "row", marginTop: spacing.lg, alignItems: "center" },
  balanceTag: { color: "#94a3b8", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  balanceSub: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 4 },
  balanceDivider: { width: 1, height: 30, backgroundColor: "#334155", marginHorizontal: 14 },
  refCard: { marginTop: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  refIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  refCode: { fontSize: 18, fontWeight: "800", color: colors.text, letterSpacing: 1.2, marginTop: 2 },
  shareBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6 },
  tx: { backgroundColor: "#fff", borderRadius: radius.md, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: colors.borderSoft },
  txIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  txTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  txDate: { fontSize: 11, color: colors.textMuted, marginTop: 2, textTransform: "capitalize" },
  txAmt: { fontSize: 15, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 32 },
});
