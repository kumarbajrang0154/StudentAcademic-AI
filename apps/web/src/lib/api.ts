/**
 * Centralized client fetch wrapper that automatically attaches the
 * Bearer token from localStorage (if available) and sends same-origin credentials.
 * On 401, attempts /auth/refresh once, retries the request, and redirects to /login
 * with session expired message if refresh fails.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers = new Headers(options.headers);
  const currentToken = getToken();
  if (currentToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }

  let response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  // Skip refresh logic for auth endpoints itself to avoid infinite loop
  const isAuthEndpoint =
    url.includes("/api/v1/auth/login") ||
    url.includes("/api/v1/auth/demo-login") ||
    url.includes("/api/v1/auth/refresh");

  if (response.status === 401 && !isAuthEndpoint) {
    try {
      const refreshRes = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (refreshRes.ok) {
        const text = await refreshRes.text();
        const data = JSON.parse(text);
        if (data.accessToken) {
          localStorage.setItem("accessToken", data.accessToken);
          headers.set("Authorization", `Bearer ${data.accessToken}`);
          // Retry original request once
          response = await fetch(url, {
            ...options,
            credentials: "include",
            headers,
          });
          return response;
        }
      }
    } catch (err) {
      console.error("Refresh attempt failed", err);
    }

    // Refresh failed - session is expired
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      const currentPath = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?error=session_expired&next=${encodeURIComponent(currentPath)}`;
      }
    }
  }

  return response;
}
