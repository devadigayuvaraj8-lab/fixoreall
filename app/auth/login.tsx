import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { colors, radius, spacing } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

export default function Login() {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP timer
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // 🔥 START TIMER
  useEffect(() => {
    let interval: any;

    if (otpSent && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }

    if (timer === 0) {
      setCanResend(true);
      clearInterval(interval);
    }

    return () => clearInterval(interval);
  }, [otpSent, timer]);

  // 📲 SEND OTP
  const sendOtp = async () => {
    setError("");

    if (phone.length !== 10) {
      setError("Enter valid mobile number");
      return;
    }

    try {
      setLoading(true);

      await api("/auth/send-otp", {
        method: "POST",
        auth: false,
        body: { phone: `+91${phone.trim()}` },
      });

      setOtpSent(true);

      // reset timer
      setTimer(60);
      setCanResend(false);
    } catch (e: any) {
      console.log("Send OTP Error:", e.message);
      setError(e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  // 🔐 VERIFY OTP
  const verifyOtp = async () => {
    setError("");

    if (!code) {
      setError("Enter OTP code");
      return;
    }

    try {
      setLoading(true);

      const response = await api("/auth/verify-otp", {
        method: "POST",
        auth: false,
        body: { phone: `+91${phone.trim()}`, code: code.trim() },
      });

      // Save JWT token
      if (response.access_token) {
        await storage.secureSet("fixo_token", response.access_token);
        router.replace("/");
      } else {
        setError("Login failed: No token received");
      }
    } catch (e: any) {
      console.log("Verify OTP Error:", e.message);
      setError(e.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome</Text>

        {/* 📱 PHONE INPUT */}
        {!otpSent && (
          <>
            <Text style={styles.label}>Mobile Number</Text>

            <View style={styles.inputBox}>
              <Text style={{ marginRight: 5 }}>+91</Text>

              <TextInput
                placeholder="9876543210"
                keyboardType="number-pad"
                value={phone}
                onChangeText={setPhone}
                style={styles.input}
                maxLength={10}
                editable={!loading}
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={sendOtp} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Send OTP</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* 🔐 OTP INPUT */}
        {otpSent && (
          <>
            <Text style={styles.label}>Enter OTP</Text>

            <TextInput
              placeholder="6-digit OTP"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              style={styles.input}
              maxLength={6}
              editable={!loading}
            />

            <TouchableOpacity style={styles.button} onPress={verifyOtp} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Verify OTP</Text>
              )}
            </TouchableOpacity>

            {/* 🔁 RESEND */}
            {canResend ? (
              <TouchableOpacity onPress={sendOtp} disabled={loading}>
                <Text style={styles.resend}>Resend OTP</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.timer}>
                Resend OTP in {timer}s
              </Text>
            )}
          </>
        )}

        {/* ❌ ERROR */}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 30,
  },

  label: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
    textTransform: "uppercase",
  },

  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    height: 52,
    backgroundColor: "#fff",
    marginBottom: 15,
  },

  input: {
    flex: 1,
    fontSize: 16,
  },

  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: 10,
  },

  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  resend: {
    marginTop: 12,
    color: colors.primary,
    fontWeight: "600",
    textAlign: "center",
  },

  timer: {
    marginTop: 12,
    color: colors.textMuted,
    textAlign: "center",
  },

  error: {
    color: "red",
    marginTop: 10,
    textAlign: "center",
  },
});