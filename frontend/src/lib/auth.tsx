import React, { createContext, useContext, useState } from "react";
import { storage } from "@/src/utils/storage";

export type User = {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  role: "customer" | "technician";
  referral_code: string;
  wallet_balance: number;
  skills?: string[];
  bio?: string | null;
  is_online?: boolean;
  rating?: number;
  lat?: number | null;
  lng?: number | null;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  const signIn = async (token: string, u: User) => {
    await storage.secureSet("fixo_token", token);
    setUser(u);
  };

  const signOut = async () => {
    await storage.secureRemove("fixo_token");
    setUser(null);
  };

  const refresh = async () => {};

  return (
    <Ctx.Provider
      value={{
        user,
        loading: false,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);