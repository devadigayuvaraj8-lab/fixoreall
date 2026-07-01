import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

export default function CustomerHome() {
  const { user } = useAuth();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
  try {
    const list = await api<any>("/services");

    console.log("SERVICES =", list);

    if (Array.isArray(list)) {
      setServices(list);
    } else if (Array.isArray(list.services)) {
      setServices(list.services);
    } else if (Array.isArray(list.data)) {
      setServices(list.data);
    } else {
      console.log("Invalid response:", list);
      setServices([]);
    }
  } catch (err) {
    console.log(err);
    setServices([]);
  } finally {
    setLoading(false);
    setRefreshing(false);
  }
}, []);

  useEffect(() => { load(); }, [load]);

  const filtered = services.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()));
  const popular = services.slice(0, 4);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.hello}>Hi, {user?.name?.split(" ")[0] || "there"} 👋</Text>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color={colors.accent} />
                <Text style={styles.locationText}>Home · Current Location</Text>
              </View>
            </View>
            <TouchableOpacity testID="profile-shortcut" style={styles.avatar} onPress={() => router.push("/(customer)/profile")}>
              <Text style={styles.avatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              testID="search-input"
              placeholder="Search 'AC repair', 'plumber'..."
              placeholderTextColor={colors.textMuted}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>
        </View>

        {/* Hero banner */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <LinearGradient colors={["#0F172A", "#1E293B"]} style={styles.banner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTag}>FIRST BOOKING</Text>
              <Text style={styles.bannerTitle}>Get ₹50 off your first service</Text>
              <Text style={styles.bannerSub}>Verified pros · 2-hour response · Cash or wallet</Text>
            </View>
            <View style={styles.bannerBadge}>
              <Text style={{ color: "#fff", fontWeight: "800" }}>50%</Text>
              <Text style={{ color: "#fbbf24", fontSize: 10 }}>OFF</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Categories grid */}
        <Text style={styles.sectionTitle}>Browse services</Text>
        {loading ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((s) => (
              <TouchableOpacity
                key={s.id}
                testID={`service-card-${s.slug}`}
                style={styles.gridItem}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: "/service/[id]", params: { id: s.id } })}
              >
                <View style={[styles.iconWrap, { backgroundColor: s.color + "1A" }]}>
                  <Text style={{ fontSize: 28 }}>{s.emoji}</Text>
                </View>
                <Text style={styles.gridName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.gridPrice}>from ₹{s.base_price}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Popular */}
        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.sectionTitle}>Most booked</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
            {popular.map((s) => (
              <TouchableOpacity
                key={s.id}
                testID={`popular-${s.slug}`}
                style={styles.popularCard}
                onPress={() => router.push({ pathname: "/service/[id]", params: { id: s.id } })}
                activeOpacity={0.9}
              >
                <Image
                  source={{ uri: `https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&q=80&auto=format` }}
                  style={styles.popularImg}
                  contentFit="cover"
                />
                <View style={{ padding: 12 }}>
                  <Text style={styles.popularName}>{s.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Ionicons name="star" size={12} color={colors.warning} />
                    <Text style={styles.popularRating}>4.8 · {Math.floor(Math.random() * 200) + 100} bookings</Text>
                  </View>
                  <Text style={styles.popularPrice}>₹{s.base_price}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl }}>
          <View style={styles.refCard}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...font.h4, color: "#fff" }}>Refer & Earn ₹200</Text>
              <Text style={{ color: "#fcd9bd", fontSize: 12, marginTop: 4 }}>Share your code: {user?.referral_code}</Text>
            </View>
            <TouchableOpacity testID="goto-wallet" style={styles.refBtn} onPress={() => router.push("/(customer)/wallet")}>
              <Text style={{ color: colors.accent, fontWeight: "700" }}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  hello: { ...font.h3, color: colors.text },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  locationText: { fontSize: 12, color: colors.textSecondary },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  searchBox: { backgroundColor: "#fff", borderRadius: radius.md, paddingHorizontal: 14, height: 48, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  banner: { borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", ...shadow.card },
  bannerTag: { color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 },
  bannerTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  bannerSub: { color: "#cbd5e1", fontSize: 12 },
  bannerBadge: { backgroundColor: "rgba(234,88,12,0.18)", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginLeft: 12 },
  sectionTitle: { ...font.h4, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, gap: 14 },
  gridItem: { width: "22%", alignItems: "center" },
  iconWrap: { width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  gridName: { fontSize: 12, fontWeight: "600", color: colors.text, textAlign: "center" },
  gridPrice: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  popularCard: { width: 220, borderRadius: radius.lg, backgroundColor: "#fff", overflow: "hidden", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  popularImg: { width: "100%", height: 110 },
  popularName: { fontSize: 14, fontWeight: "700", color: colors.text },
  popularRating: { fontSize: 11, color: colors.textSecondary },
  popularPrice: { fontSize: 14, fontWeight: "700", color: colors.accent, marginTop: 6 },
  refCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center" },
  refBtn: { backgroundColor: "#fff", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
});
