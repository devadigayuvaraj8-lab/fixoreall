import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"customer" | "technician">("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email");
      return;
    }
    setLoading(true);
    try {
      const r = await api<{ ok: boolean; dev_mode: boolean; dev_otp?: string }>("/auth/request-otp", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), role },
        auth: false,
      });
      router.push({
        pathname: "/auth/verify",
        params: { email: email.trim().toLowerCase(), role, dev_otp: r.dev_otp || "" },
      });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.logoBox}><Text style={styles.logoText}>FIXO</Text></View>
            <Text style={styles.tag}>Home services, on demand.</Text>
          </View>

          <View style={styles.card}>
            <Text style={font.h2}>Welcome</Text>
            <Text style={[font.small, { marginTop: 6 }]}>Sign in with email — we&apos;ll send you a 6-digit code.</Text>

            <View style={styles.roleRow}>
              <TouchableOpacity
                testID="role-customer"
                style={[styles.roleBtn, role === "customer" && styles.roleBtnActive]}
                onPress={() => setRole("customer")}
                activeOpacity={0.85}
              >
                <Ionicons name="person-outline" size={18} color={role === "customer" ? "#fff" : colors.text} />
                <Text style={[styles.roleText, role === "customer" && { color: "#fff" }]}>I&apos;m a Customer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="role-technician"
                style={[styles.roleBtn, role === "technician" && styles.roleBtnActive]}
                onPress={() => setRole("technician")}
                activeOpacity={0.85}
              >
                <Ionicons name="construct-outline" size={18} color={role === "technician" ? "#fff" : colors.text} />
                <Text style={[styles.roleText, role === "technician" && { color: "#fff" }]}>I&apos;m a Technician</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
              <TextInput
                testID="email-input"
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
            </View>

            {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

            <TouchableOpacity
              testID="login-submit-button"
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={submit}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Text style={styles.primaryText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.footHelp}>By continuing you agree to our Terms & Privacy.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: spacing.lg, justifyContent: "center" },
  brandRow: { alignItems: "center", marginBottom: spacing.xl },
  logoBox: { paddingHorizontal: 18, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 10, marginBottom: 8 },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 28, letterSpacing: 3 },
  tag: { ...font.small, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, ...shadow.card },
  roleRow: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  roleBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  roleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  roleText: { fontSize: 13, fontWeight: "600", color: colors.text },
  label: { ...font.tiny, marginTop: spacing.lg, marginBottom: 8, textTransform: "uppercase" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, gap: 8, backgroundColor: "#fff" },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  primaryBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  footHelp: { ...font.small, textAlign: "center", marginTop: spacing.md, color: colors.textMuted, fontSize: 11 },
  error: { color: colors.danger, marginTop: 10, fontSize: 13 },
});
