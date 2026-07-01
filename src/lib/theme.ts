// FIXO design tokens — slate + orange, premium marketplace look
export const colors = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  primary: "#0F172A",
  primarySoft: "#1E293B",
  accent: "#EA580C",
  accentSoft: "#FED7AA",
  text: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  border: "#E2E8F0",
  borderSoft: "#F1F5F9",
  success: "#10B981",
  warning: "#F59E0B",
  info: "#3B82F6",
  danger: "#EF4444",
  chip: "#F1F5F9",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  pop: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
};

export const font = {
  h1: { fontSize: 30, fontWeight: "700" as const, letterSpacing: -0.5, color: colors.text },
  h2: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.3, color: colors.text },
  h3: { fontSize: 18, fontWeight: "700" as const, color: colors.text },
  h4: { fontSize: 16, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  tiny: { fontSize: 11, color: colors.textMuted, letterSpacing: 0.5 },
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Finding Technician",
  assigned: "Technician Assigned",
  accepted: "Accepted",
  on_the_way: "On the Way",
  started: "Service Started",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_COLOR: Record<string, string> = {
  pending: colors.warning,
  assigned: colors.info,
  accepted: colors.info,
  on_the_way: colors.accent,
  started: colors.accent,
  completed: colors.success,
  cancelled: colors.danger,
};
