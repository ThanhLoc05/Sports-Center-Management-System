import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSession } from "./api";
import type { Session } from "./types";
interface AuthContextType {
  session: Session | null;
  signIn: (s: Session) => void;
  signOut: () => void;
}
const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(getSession);
  const client = useQueryClient();
  const signOut = () => {
    sessionStorage.removeItem("sportiva-session");
    setSession(null);
    client.clear();
  };
  const signIn = (s: Session) => {
    sessionStorage.setItem("sportiva-session", JSON.stringify(s));
    client.clear();
    setSession(s);
  };
  useEffect(() => {
    const expire = () => {
      sessionStorage.removeItem("sportiva-session");
      setSession(null);
      client.clear();
    };
    window.addEventListener("sportiva:unauthorized", expire);
    return () => window.removeEventListener("sportiva:unauthorized", expire);
  }, [client]);
  useEffect(() => {
    if (session?.mode !== "api") return;
    try {
      const payload = JSON.parse(
        atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.exp) {
        const delay = payload.exp * 1000 - Date.now();
        if (delay <= 0) {
          window.dispatchEvent(new Event("sportiva:unauthorized"));
          return;
        }
        const id = setTimeout(
          () => window.dispatchEvent(new Event("sportiva:unauthorized")),
          Math.min(delay, 2147483647),
        );
        return () => clearTimeout(id);
      }
    } catch {
      /* server verifies opaque token */
    }
  }, [session]);
  return (
    <AuthContext.Provider value={{ session, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("Auth provider missing");
  return ctx;
}
