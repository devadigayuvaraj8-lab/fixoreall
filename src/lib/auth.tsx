import React, { createContext, useContext, useEffect, useState } from "react";
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
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const AuthProvider = ({ children }: any) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const savedUser = await storage.getItem("fixo_user", null);

        if (savedUser) {
        setUser(savedUser as User);
       }
      } catch (e) {
        console.log(e);
      }

      setLoading(false);
    };

    load();
  }, []);

  const signIn = async (token: string, u: User) => {
  await storage.secureSet("fixo_token", token);
  await storage.setItem("fixo_user", u);
  setUser(u);
};

  const signOut = async () => {
  await storage.secureRemove("fixo_token");
  await storage.removeItem("fixo_user");
  setUser(null);
};

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);