/**
 * Centralized client fetch wrapper that automatically attaches the
 * Bearer token from localStorage (if available) and sends same-origin credentials.
 * On 401, attempts /auth/refresh once, retries the request, and redirects to /login
 * with session expired message if refresh fails.
 */
export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 15000, ...fetchOptions } = options;

  const controller = new AbortController();
  let timerId: NodeJS.Timeout | null = null;
  if (!options.signal) {
    timerId = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  }

  const signal = options.signal || controller.signal;

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers = new Headers(fetchOptions.headers);
  const currentToken = getToken();
  if (currentToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${currentToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      credentials: "include",
      headers,
      signal,
    });
  } finally {
    if (timerId) clearTimeout(timerId);
  }

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
