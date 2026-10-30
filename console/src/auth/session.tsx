import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "../api/types";

// Seeded users from the local dev issuer (ARCHITECTURE §8.2). The session lives in memory
// only, never in localStorage, so a reload signs you out (T83).
export const SEEDED_USERS: User[] = [
  { id: "supervisor1", displayName: "supervisor1", role: "supervisor" },
  { id: "analyst1", displayName: "analyst1", role: "analyst" },
  { id: "auditor1", displayName: "auditor1", role: "auditor" },
  { id: "admin1", displayName: "admin1", role: "admin" },
];

interface Session {
  user: User | null;
  /** Stable getter for non-React code (the API client) that needs the current principal. */
  currentUser: () => User | null;
  signIn: (userId: string) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ initialUserId, children }: { initialUserId?: string; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => SEEDED_USERS.find((u) => u.id === initialUserId) ?? null);
  const ref = useRef(user);
  const value = useMemo<Session>(
    () => ({
      user,
      currentUser: () => ref.current,
      signIn: (id) => {
        const next = SEEDED_USERS.find((u) => u.id === id) ?? null;
        ref.current = next;
        setUser(next);
      },
      signOut: () => {
        ref.current = null;
        setUser(null);
      },
    }),
    [user],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}

/** The signed-in user. Only call it below the sign-in gate. */
export function useUser(): User {
  const { user } = useSession();
  if (!user) throw new Error("useUser called without a signed-in user");
  return user;
}
