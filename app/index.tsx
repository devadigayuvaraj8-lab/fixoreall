import { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
  withSequence,
} from "react-native-reanimated";
import { useAuth } from "@/src/lib/auth";
import { colors } from "@/src/lib/theme";

const { width, height } = Dimensions.get("window");
const LETTERS = ["F", "I", "X", "O"];
const FLOAT_ICONS = ["⚡", "🔧", "❄️", "🧹", "🪚", "🎨", "📺", "🐜"];

export default function Splash() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // animation values
  const logoScale = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const underline = useSharedValue(0);
  const tagOpacity = useSharedValue(0);
  const tagY = useSharedValue(20);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const letters = LETTERS.map(() => useSharedValue(0));
  const burstIcons = FLOAT_ICONS.map(() => ({
    s: useSharedValue(0),
    r: useSharedValue(0),
  }));

  useEffect(() => {
    // ring breathing
    ringOpacity.value = withTiming(0.18, { duration: 500 });
    ringScale.value = withRepeat(withTiming(1.15, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);

    // logo entrance
    logoOpacity.value = withTiming(1, { duration: 400 });
    logoScale.value = withSpring(1, { damping: 9, stiffness: 100 });

    // letters one-by-one
    letters.forEach((v, i) => {
      v.value = withDelay(150 + i * 110, withSpring(1, { damping: 12, stiffness: 150 }));
    });

    // accent underline slide
    underline.value = withDelay(700, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    // tagline
    tagOpacity.value = withDelay(1100, withTiming(1, { duration: 500 }));
    tagY.value = withDelay(1100, withSpring(0, { damping: 14 }));

    // burst service icons
    burstIcons.forEach((b, i) => {
      b.s.value = withDelay(900 + i * 80, withSpring(1, { damping: 10, stiffness: 120 }));
      b.r.value = withDelay(900 + i * 80, withRepeat(
        withSequence(
          withTiming(8, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(-8, { duration: 1600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      ));
    });

    // navigate after splash
    const t = setTimeout(() => {
      if (loading) return;
      if (!user) router.replace("/auth/login");
      else if (user.role === "customer") router.replace("/(customer)/home");
      else router.replace("/(technician)/home");
    }, 2400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ scale: logoScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value, transform: [{ scale: ringScale.value }] }));
  const underlineStyle = useAnimatedStyle(() => ({ width: 220 * underline.value, opacity: underline.value }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: tagOpacity.value, transform: [{ translateY: tagY.value }] }));

  // positions of floating icons in a circle around logo
  const ICON_POSITIONS = [
    { left: 0.08, top: 0.18 }, { left: 0.78, top: 0.16 },
    { left: 0.06, top: 0.74 }, { left: 0.82, top: 0.72 },
    { left: 0.18, top: 0.36 }, { left: 0.74, top: 0.34 },
    { left: 0.2, top: 0.62 }, { left: 0.72, top: 0.58 },
  ];

  return (
    <LinearGradient colors={["#0F172A", "#1E293B", "#0F172A"]} style={styles.bg}>
      {/* Glowing ring behind logo */}
      <Animated.View style={[styles.ring, ringStyle]} />
      <Animated.View style={[styles.ring, styles.ring2, ringStyle]} />

      {/* Floating service icons */}
      {FLOAT_ICONS.map((emoji, i) => {
        const pos = ICON_POSITIONS[i];
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const iconStyle = useAnimatedStyle(() => ({
          opacity: burstIcons[i].s.value * 0.7,
          transform: [
            { translateX: burstIcons[i].r.value },
            { scale: 0.6 + burstIcons[i].s.value * 0.4 },
          ],
        }));
        return (
          <Animated.View
            key={i}
            style={[
              styles.floatIcon,
              { left: pos.left * width, top: pos.top * height },
              iconStyle,
            ]}
          >
            <Text style={{ fontSize: 32 }}>{emoji}</Text>
          </Animated.View>
        );
      })}

      <View style={styles.center} testID="splash-screen">
        <Animated.View style={[styles.logoRow, logoStyle]}>
          {LETTERS.map((ch, i) => {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const letterStyle = useAnimatedStyle(() => ({
              opacity: letters[i].value,
              transform: [{ translateY: (1 - letters[i].value) * 30 }, { scale: 0.5 + letters[i].value * 0.5 }],
            }));
            return (
              <Animated.Text key={i} style={[styles.letter, letterStyle]}>
                {ch}
              </Animated.Text>
            );
          })}
        </Animated.View>

        <Animated.View style={[styles.underline, underlineStyle]} />

        <Animated.Text style={[styles.tag, tagStyle]}>
          Home services, <Text style={{ color: colors.accent, fontWeight: "800" }}>on demand.</Text>
        </Animated.Text>

        <Animated.View style={[styles.dotsRow, tagStyle]}>
          <Dot delay={1400} />
          <Dot delay={1550} />
          <Dot delay={1700} />
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withRepeat(
      withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
      -1,
      true,
    ));
  }, [delay, v]);
  const st = useAnimatedStyle(() => ({ opacity: 0.3 + v.value * 0.7, transform: [{ scale: 0.8 + v.value * 0.5 }] }));
  return <Animated.View style={[styles.dot, st]} />;
}

const styles = StyleSheet.create({
  bg: { flex: 1, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", justifyContent: "center", zIndex: 2 },
  logoRow: { flexDirection: "row", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.accent },
  letter: { color: "#fff", fontWeight: "900", fontSize: 56, letterSpacing: 6, includeFontPadding: false },
  underline: { height: 4, backgroundColor: colors.accent, borderRadius: 2, marginTop: 18, shadowColor: colors.accent, shadowOpacity: 0.7, shadowRadius: 12, elevation: 8 },
  tag: { color: "#E2E8F0", fontSize: 16, marginTop: 22, letterSpacing: 0.3 },
  ring: { position: "absolute", width: 320, height: 320, borderRadius: 160, borderWidth: 1, borderColor: colors.accent, opacity: 0.18 },
  ring2: { width: 460, height: 460, borderRadius: 230, borderColor: "#475569" },
  floatIcon: { position: "absolute", width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  dotsRow: { flexDirection: "row", marginTop: 30, gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
});
