import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth";

export default function Profile() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const logout = async () => {
    await signOut();
    router.replace("/auth/login");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 32 }}>
        <Text style={font.h2}>Profile</Text>

        <View style={styles.userCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || "U").charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.rolePill}>
              <Ionicons name="person" size={11} color={colors.accent} />
              <Text style={styles.roleText}>{user?.role === "customer" ? "Customer" : "Technician"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.menuCard}>
          <Item icon="receipt-outline" label="My Bookings" onPress={() => router.push("/(customer)/bookings")} testID="menu-bookings" />
          <Item icon="wallet-outline" label="Wallet & Referrals" onPress={() => router.push("/(customer)/wallet")} testID="menu-wallet" />
          <Item icon="help-circle-outline" label="Help & Support" onPress={() => {}} testID="menu-support" />
          <Item icon="document-text-outline" label="Terms & Privacy" onPress={() => {}} testID="menu-terms" last />
        </View>

        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={logout} activeOpacity={0.9}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 15 }}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24, fontSize: 11 }}>FIXO v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Item({ icon, label, onPress, testID, last }: { icon: any; label: string; onPress: () => void; testID: string; last?: boolean }) {
  return (
    <TouchableOpacity testID={testID} style={[styles.item, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.itemIcon}><Ionicons name={icon} size={18} color={colors.text} /></View>
      <Text style={{ flex: 1, fontWeight: "600", color: colors.text }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  userCard: { marginTop: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, padding: spacing.md, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "800" },
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  email: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 6 },
  roleText: { fontSize: 11, fontWeight: "700", color: colors.accent },
  menuCard: { marginTop: spacing.lg, backgroundColor: "#fff", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, ...shadow.card },
  item: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  itemIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center", marginRight: 12 },
  logoutBtn: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger + "44", backgroundColor: "#fff" },
});
