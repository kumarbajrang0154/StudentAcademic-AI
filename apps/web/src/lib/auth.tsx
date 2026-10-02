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

async function parseJsonResponse<T>(
  res: Response,
  url: string,
): Promise<{ data: T | null; error?: string }> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    console.error(`HTTP ${res.status} from ${url}`);
    return {
      data: null,
      error: "Cannot reach the server. Please try again in a moment.",
    };
  }

  let json: T | null = null;
  try {
    json = JSON.parse(text) as T;
  } catch {
    console.error(`HTTP ${res.status} from ${url}`);
    return {
      data: null,
      error: "Cannot reach the server. Please try again in a moment.",
    };
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${url}`);
    const errorMsg =
      (json as { message?: string })?.message ||
      "Cannot reach the server. Please try again in a moment.";
    return { data: null, error: errorMsg };
  }

  return { data: json };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = async () => {
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      const url = "/api/v1/auth/me";
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const parsed = await parseJsonResponse<{ user: User }>(res, url);
      if (res.ok && parsed.data?.user) {
        setUser(parsed.data.user);
      } else {
        // Attempt token refresh
        const refreshUrl = "/api/v1/auth/refresh";
        const refreshRes = await fetch(refreshUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const refreshParsed = await parseJsonResponse<{
          accessToken: string;
          user: User;
        }>(refreshRes, refreshUrl);
        if (refreshRes.ok && refreshParsed.data?.user) {
          if (refreshParsed.data.accessToken) {
            localStorage.setItem("accessToken", refreshParsed.data.accessToken);
          }
          setUser(refreshParsed.data.user);
        } else {
          setUser(null);
          localStorage.removeItem("accessToken");
        }
      }
    } catch (err) {
      console.error("Auth me check failed:", err);
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
    const url = "/api/v1/auth/login";
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const parsed = await parseJsonResponse<{
        accessToken?: string;
        user?: User;
        message?: string;
      }>(res, url);

      if (!res.ok || !parsed.data) {
        return {
          success: false,
          error:
            parsed.error ||
            "Cannot reach the server. Please try again in a moment.",
        };
      }
      if (parsed.data.accessToken) {
        localStorage.setItem("accessToken", parsed.data.accessToken);
      }
      if (parsed.data.user) {
        setUser(parsed.data.user);
      }
      return { success: true };
    } catch (err: unknown) {
      console.error(`Network error connecting to ${url}:`, err);
      return {
        success: false,
        error: "Cannot reach the server. Please try again in a moment.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = async (
    role: "STUDENT" | "FACULTY" | "MENTOR" | "HOD" | "ADMIN",
  ) => {
    setIsLoading(true);
    const url = "/api/v1/auth/demo-login";
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const parsed = await parseJsonResponse<{
        accessToken?: string;
        user?: User;
        message?: string;
      }>(res, url);

      if (!res.ok || !parsed.data) {
        return {
          success: false,
          error:
            parsed.error ||
            "Cannot reach the server. Please try again in a moment.",
        };
      }
      if (parsed.data.accessToken) {
        localStorage.setItem("accessToken", parsed.data.accessToken);
      }
      if (parsed.data.user) {
        setUser(parsed.data.user);
      }
      return { success: true, user: parsed.data.user };
    } catch (err: unknown) {
      console.error(`Network error connecting to ${url}:`, err);
      return {
        success: false,
        error: "Cannot reach the server. Please try again in a moment.",
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Logout request failed:", err);
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
