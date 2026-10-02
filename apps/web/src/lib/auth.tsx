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
  demoMode: boolean;
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

function getErrorMessage(status: number, serverMsg?: string): string {
  if (status === 401) {
    return "Invalid credentials.";
  }
  if (status === 403) {
    return "Demo login is disabled.";
  }
  if (status === 404) {
    return "API route not found. Check API_URL configuration.";
  }
  if (status === 502 || status === 503 || status === 504 || status >= 500) {
    return "Server is waking up (can take up to 60s). Please retry.";
  }
  return serverMsg || "Cannot reach the server.";
}

async function parseJsonResponse<T>(
  res: Response,
  url: string,
): Promise<{ data: T | null; error?: string }> {
  const path = url.split("?")[0];
  let text = "";
  try {
    text = await res.text();
  } catch {
    console.error(`HTTP ${res.status} ${path}`);
    return {
      data: null,
      error: getErrorMessage(res.status),
    };
  }

  let json: T | null = null;
  try {
    json = JSON.parse(text) as T;
  } catch {
    // Non-JSON response (e.g. HTML 404, 502, 503)
    console.error(`HTTP ${res.status} ${path}`);
    return {
      data: null,
      error: getErrorMessage(res.status),
    };
  }

  if (!res.ok) {
    console.error(`HTTP ${res.status} ${path}`);
    const serverMsg = (json as { message?: string })?.message;
    return {
      data: null,
      error: getErrorMessage(res.status, serverMsg),
    };
  }

  return { data: json };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkDemoStatus() {
      try {
        const url = "/api/v1/auth/demo-status";
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`HTTP ${res.status} ${url}`);
          return;
        }
        const text = await res.text();
        const data = JSON.parse(text);
        if (isMounted && typeof data?.demoMode === "boolean") {
          setDemoMode(data.demoMode);
        }
      } catch {
        console.error("Network error /api/v1/auth/demo-status");
      }
    }
    checkDemoStatus();
    return () => {
      isMounted = false;
    };
  }, []);

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
    } catch {
      console.error("Network error /api/v1/auth/me");
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
            "Cannot reach the server.",
        };
      }
      if (parsed.data.accessToken) {
        localStorage.setItem("accessToken", parsed.data.accessToken);
      }
      if (parsed.data.user) {
        setUser(parsed.data.user);
      }
      return { success: true };
    } catch {
      console.error("Network error /api/v1/auth/login");
      return {
        success: false,
        error: "Cannot reach the server.",
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
            "Cannot reach the server.",
        };
      }
      if (parsed.data.accessToken) {
        localStorage.setItem("accessToken", parsed.data.accessToken);
      }
      if (parsed.data.user) {
        setUser(parsed.data.user);
      }
      return { success: true, user: parsed.data.user };
    } catch {
      console.error("Network error /api/v1/auth/demo-login");
      return {
        success: false,
        error: "Cannot reach the server.",
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
    } catch {
      console.error("Network error /api/v1/auth/logout");
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
          demoMode,
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
