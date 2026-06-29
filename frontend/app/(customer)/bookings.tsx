import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, shadow, STATUS_LABEL, STATUS_COLOR } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

type Booking = {
  id: string;
  service_name: string;
  service_emoji: string;
  status: string;
  total: number;
  created_at: string;
  technician_name?: string | null;
  address: string;
};

export default function Bookings() {
  const router = useRouter();
  const [items, setItems] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await api<Booking[]>("/bookings");
      setItems(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={font.h2}>My Bookings</Text>
        <Text style={[font.small, { marginTop: 2 }]}>Track all your services in one place</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
              <Text style={[font.h4, { marginTop: 12 }]}>No bookings yet</Text>
              <Text style={font.small}>Book a service from the Home tab.</Text>
              <TouchableOpacity testID="empty-cta" style={styles.emptyCta} onPress={() => router.push("/(customer)/home")}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>Browse Services</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`booking-card-${item.id}`}
              style={styles.card}
              onPress={() => router.push({ pathname: "/booking/[id]", params: { id: item.id } })}
              activeOpacity={0.9}
            >
              <View style={styles.emojiBox}><Text style={{ fontSize: 22 }}>{item.service_emoji}</Text></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.service_name}</Text>
                <Text style={styles.cardAddr} numberOfLines={1}>{item.address}</Text>
                {item.technician_name ? (
                  <Text style={styles.cardTech}>Tech: {item.technician_name}</Text>
                ) : null}
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + "22" }]}>
                  <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.status] }]} />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS_COLOR[item.status] }}>{STATUS_LABEL[item.status] || item.status}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.amt}>₹{item.total}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginTop: 8 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  card: { backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  emojiBox: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  cardAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardTech: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginTop: 6, gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  amt: { fontSize: 16, fontWeight: "700", color: colors.text },
  empty: { alignItems: "center", paddingTop: 64 },
  emptyCta: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.primary },
});
