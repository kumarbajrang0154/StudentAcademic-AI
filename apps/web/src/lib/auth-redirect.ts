/**
 * Pure helper for hardened post-login redirection.
 * - Prevents open redirects (relative paths only, single leading slash, no scheme, no "//", no backslash).
 * - Enforces role-based path authorization (e.g. STUDENT cannot be sent to /faculty or /mentor).
 */
export function getSafePostLoginRedirect(
  nextParam: string | null | undefined,
  userRole?: string,
): string {
  const roleHome = getRoleHome(userRole);

  if (!nextParam) return roleHome;

  const trimmed = nextParam.trim();

  // Must start with a single "/" and NOT "//"
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return roleHome;
  }

  // Prevent backslash, colon (protocols/schemes), @ (authority components)
  if (trimmed.includes("\\") || trimmed.includes(":") || trimmed.includes("@")) {
    return roleHome;
  }

  // Check role authorization for the requested path
  if (!isPathAllowedForRole(trimmed, userRole)) {
    return roleHome;
  }

  return trimmed;
}

export function getRoleHome(userRole?: string): string {
  switch (userRole) {
    case "STUDENT":
      return "/student/dashboard";
    case "FACULTY":
      return "/faculty/dashboard";
    case "MENTOR":
      return "/mentor/dashboard";
    case "HOD":
    case "ADMIN":
      return "/admin/dashboard";
    default:
      return "/student/dashboard";
  }
}

export function isPathAllowedForRole(path: string, userRole?: string): boolean {
  if (!userRole) return false;

  switch (userRole) {
    case "STUDENT":
      return path.startsWith("/student");
    case "FACULTY":
      return path.startsWith("/faculty");
    case "MENTOR":
      return path.startsWith("/mentor");
    case "HOD":
      return path.startsWith("/faculty") || path.startsWith("/admin");
    case "ADMIN":
      return (
        path.startsWith("/faculty") ||
        path.startsWith("/mentor") ||
        path.startsWith("/admin") ||
        path.startsWith("/student")
      );
    default:
      return false;
  }
}
