"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN";
  departmentId?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  demoLogin: (
    role: "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN",
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const queryClient = new QueryClient();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      const res = await fetch("/api/v1/auth/me", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Attempt token refresh
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.accessToken) {
            localStorage.setItem("accessToken", refreshData.accessToken);
          }
          setUser(refreshData.user);
        } else {
          setUser(null);
          localStorage.removeItem("accessToken");
        }
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || "Login failed" };
      }
      if (data.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
      }
      setUser(data.user);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (
    role: "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN",
  ) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.message || "Demo login failed" };
      }
      if (data.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
      }
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      localStorage.removeItem("accessToken");
      setUser(null);
      window.location.href = "/login";
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          user,
          isLoading,
          login,
          demoLogin,
          logout,
          refetchUser: fetchMe,
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
