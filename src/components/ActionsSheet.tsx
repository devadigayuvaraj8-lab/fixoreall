import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, shadow } from "@/src/lib/theme";
import { api } from "@/src/lib/api";

const QUIT_REASONS = [
  { label: "Vehicle breakdown", icon: "construct" as const },
  { label: "Personal emergency", icon: "alert-circle" as const },
  { label: "Wrong address", icon: "location" as const },
  { label: "Customer unreachable", icon: "call" as const },
  { label: "Other", icon: "help-circle" as const },
];

const DELAY_REASONS = [
  { label: "Heavy traffic", icon: "car" as const, minutes: 10 },
  { label: "Vehicle issue", icon: "warning" as const, minutes: 15 },
  { label: "Weather", icon: "rainy" as const, minutes: 10 },
  { label: "Other", icon: "time" as const, minutes: 5 },
];

export function ActionsSheet({
  bookingId,
  visible,
  onClose,
  onDone,
  mode,
}: {
  bookingId: string;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  mode: "quit" | "delay";
}) {
  const [busy, setBusy] = useState(false);
  const list = mode === "quit" ? QUIT_REASONS : DELAY_REASONS;
  const title = mode === "quit" ? "Quit this job" : "Report delay";
  const subtitle = mode === "quit" ? "We'll find another technician immediately." : "Customer will see updated ETA.";

  const submit = async (reason: string, minutes?: number) => {
    setBusy(true);
    try {
      if (mode === "quit") {
        await api(`/bookings/${bookingId}/quit`, { method: "POST", body: { reason } });
      } else {
        await api(`/bookings/${bookingId}/delay`, { method: "POST", body: { reason, minutes: minutes || 5 } });
      }
      onDone();
      onClose();
    } catch {} finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} style={s.backdrop} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} testID={`${mode}-sheet`}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={[s.iconBox, { backgroundColor: (mode === "quit" ? colors.danger : colors.warning) + "22" }]}>
              <Ionicons name={mode === "quit" ? "exit" : "time"} size={22} color={mode === "quit" ? colors.danger : colors.warning} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={font.h3}>{title}</Text>
              <Text style={{ ...font.small, marginTop: 2 }}>{subtitle}</Text>
            </View>
          </View>

          {list.map((r) => (
            <TouchableOpacity
              key={r.label}
              testID={`reason-${r.label}`}
              style={s.option}
              onPress={() => submit(r.label, (r as any).minutes)}
              disabled={busy}
            >
              <View style={s.optIcon}><Ionicons name={r.icon} size={18} color={colors.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.optLabel}>{r.label}</Text>
                {mode === "delay" && (r as any).minutes && <Text style={s.optSub}>+{(r as any).minutes} min ETA</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}

          {busy && <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />}

          <TouchableOpacity onPress={onClose} style={s.cancelBtn} testID="sheet-cancel">
            <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, ...shadow.pop },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: "center", marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  option: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSoft, marginTop: 8 },
  optIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.chip, alignItems: "center", justifyContent: "center", marginRight: 12 },
  optLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  optSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  cancelBtn: { marginTop: 16, padding: 12, alignItems: "center" },
});
