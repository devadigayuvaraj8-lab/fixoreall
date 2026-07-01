import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

type Earnings = {
  today: number;
  week: number;
  month: number;
  balance: number;
  completed_jobs: number;
  chart_7d: { date: string; amount: number }[];
};

export default function EarningsScreen() {
  const [data, setData] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Earnings>("/technician/earnings");
      setData(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.accent} style={{ marginTop: 80 }} /></SafeAreaView>;
  }
  if (!data) return null;

  const max = Math.max(1, ...data.chart_7d.map((c) => c.amount));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
      >
        <Text style={font.h2}>Earnings</Text>
        <Text style={[font.small, { marginTop: 2 }]}>Track your income & growth</Text>

        <LinearGradient colors={["#EA580C", "#F97316"]} style={styles.balCard}>
          <Text style={styles.balLabel}>Wallet Balance</Text>
          <Text style={styles.balAmt} testID="tech-balance">₹{data.balance.toFixed(2)}</Text>
          <View style={styles.balRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.balTag}>Today</Text>
              <Text style={styles.balVal}>₹{data.today.toFixed(0)}</Text>
            </View>
            <View style={styles.balDiv} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balTag}>This week</Text>
              <Text style={styles.balVal}>₹{data.week.toFixed(0)}</Text>
            </View>
            <View style={styles.balDiv} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balTag}>This month</Text>
              <Text style={styles.balVal}>₹{data.month.toFixed(0)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Bar chart */}
        <View style={styles.chartCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={font.h4}>Last 7 days</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Earnings</Text>
            </View>
          </View>
          <View style={styles.bars}>
            {data.chart_7d.map((c, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[styles.bar, { height: 8 + (c.amount / max) * 100, backgroundColor: c.amount > 0 ? colors.accent : colors.border }]} />
                <Text style={styles.barLabel}>{c.date}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statRow}>
          <View style={styles.statCard}>
            <Ionicons name="briefcase" size={20} color={colors.accent} />
            <Text style={styles.statN}>{data.completed_jobs}</Text>
            <Text style={styles.statL}>Completed jobs</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={20} color={colors.success} />
            <Text style={styles.statN}>85%</Text>
            <Text style={styles.statL}>Earn per booking</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={colors.info} />
          <Text style={styles.infoText}>You earn 85% of each booking. Platform fee is 15%. Withdrawals are processed weekly.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  balCard: { marginTop: spacing.lg, borderRadius: radius.xl, padding: spacing.xl, ...shadow.pop },
  balLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  balAmt: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 8, letterSpacing: -0.5 },
  balRow: { flexDirection: "row", marginTop: spacing.lg, alignItems: "center" },
  balTag: { color: "rgba(255,255,255,0.7)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  balVal: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 4 },
  balDiv: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 },
  chartCard: { marginTop: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: spacing.lg, height: 130 },
  barCol: { alignItems: "center", flex: 1 },
  bar: { width: 22, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barLabel: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: "600" },
  statRow: { flexDirection: "row", gap: 12, marginTop: spacing.lg },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  statN: { fontSize: 22, fontWeight: "800", marginTop: 8 },
  statL: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  infoCard: { marginTop: spacing.lg, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.info + "11", padding: spacing.md, borderRadius: radius.md },
  infoText: { flex: 1, fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
