import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { useAuth, type User } from "@/src/lib/auth";

export default function Verify() {
  const { email, role, dev_otp } = useLocalSearchParams<{ email: string; role: string; dev_otp?: string }>();
  const router = useRouter();
  const { signIn } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [referral, setReferral] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [remaining, setRemaining] = useState(30);
  const inputs = useRef<TextInput[]>([]);

  useEffect(() => {
    const t = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // auto-fill in dev mode
    if (dev_otp && typeof dev_otp === "string" && dev_otp.length === 6) {
      setDigits(dev_otp.split(""));
    }
  }, [dev_otp]);

  const setDigit = (idx: number, val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);
    if (cleaned && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKey = (idx: number, key: string) => {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const verify = async () => {
    setError(null);
    const otp = digits.join("");
    if (otp.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const r = await api<{ token: string; user: User }>("/auth/verify-otp", {
        method: "POST",
        body: { email, otp, role: role || "customer", referral_code: referral || undefined },
        auth: false,
      });
      await signIn(r.token, r.user);
      router.replace(r.user.role === "customer" ? "/(customer)/home" : "/(technician)/home");
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (remaining > 0) return;
    setResending(true);
    setError(null);
    try {
      const r = await api<{ dev_otp?: string }>("/auth/request-otp", {
        method: "POST",
        body: { email, role },
        auth: false,
      });
      setRemaining(30);
      if (r.dev_otp) setDigits(r.dev_otp.split(""));
    } catch (e: any) {
      setError(e.message || "Could not resend");
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.container}>
          <Text style={font.h1}>Enter code</Text>
          <Text style={[font.small, { marginTop: 6 }]}>We sent a 6-digit code to <Text style={{ fontWeight: "700", color: colors.text }}>{email}</Text></Text>

          {dev_otp ? (
            <View style={styles.devTag} testID="dev-otp-tag">
              <Ionicons name="flash" size={14} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>DEV MODE — code: {dev_otp}</Text>
            </View>
          ) : null}

          <View style={styles.otpRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                testID={`otp-input-${i}`}
                ref={(r) => { if (r) inputs.current[i] = r; }}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={({ nativeEvent }) => handleKey(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                style={styles.otpBox}
              />
            ))}
          </View>

          <Text style={styles.label}>Referral code (optional)</Text>
          <View style={styles.inputBox}>
            <Ionicons name="gift-outline" size={20} color={colors.textSecondary} />
            <TextInput
              testID="referral-input"
              placeholder="FIXO-XXXXXX"
              placeholderTextColor={colors.textMuted}
              value={referral}
              onChangeText={(v) => setReferral(v.toUpperCase())}
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>

          {error ? <Text style={styles.error} testID="verify-error">{error}</Text> : null}

          <TouchableOpacity testID="verify-submit-button" style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={verify} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify & Continue</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={resend} disabled={remaining > 0 || resending} style={{ marginTop: 16, alignSelf: "center" }} testID="resend-btn">
            <Text style={{ color: remaining > 0 ? colors.textMuted : colors.accent, fontWeight: "600" }}>
              {remaining > 0 ? `Resend in ${remaining}s` : (resending ? "Sending…" : "Resend code")}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border },
  container: { padding: spacing.lg },
  devTag: { marginTop: 14, alignSelf: "flex-start", flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xl, gap: 8 },
  otpBox: { flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", textAlign: "center", fontSize: 22, fontWeight: "700", color: colors.text, ...shadow.card },
  label: { ...font.tiny, marginTop: spacing.xl, marginBottom: 8, textTransform: "uppercase" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, gap: 8, backgroundColor: "#fff" },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  primaryBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: colors.danger, marginTop: 10, fontSize: 13 },
});