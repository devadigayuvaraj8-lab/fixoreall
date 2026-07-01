import { storage } from "@/src/utils/storage";

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

export type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: any;
  auth?: boolean;
  headers?: Record<string, string>;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = `${BASE}/api${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (opts.auth !== false) {
    const token = await storage.secureGet<string>("fixo_token", "");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export function wsUrl(path: string): string {
  const base = BASE.replace(/^http/, "ws");
  return `${base}/api${path.startsWith("/") ? path : `/${path}`}`;
}

export const BACKEND_URL = BASE;
