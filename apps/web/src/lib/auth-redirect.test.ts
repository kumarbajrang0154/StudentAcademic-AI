import { describe, it, expect } from "vitest";
import { getSafePostLoginRedirect } from "./auth-redirect.js";

describe("getSafePostLoginRedirect", () => {
  it("allows legitimate paths for matching roles", () => {
    expect(getSafePostLoginRedirect("/student/academics/subjects", "STUDENT")).toBe(
      "/student/academics/subjects",
    );
    expect(getSafePostLoginRedirect("/faculty/courses/cuid-cs101/gradebook", "FACULTY")).toBe(
      "/faculty/courses/cuid-cs101/gradebook",
    );
    expect(getSafePostLoginRedirect("/mentor/mentees/student-01", "MENTOR")).toBe(
      "/mentor/mentees/student-01",
    );
    expect(getSafePostLoginRedirect("/admin/dashboard", "ADMIN")).toBe(
      "/admin/dashboard",
    );
  });

  it("blocks protocol-relative open-redirect attempts", () => {
    expect(getSafePostLoginRedirect("//evil.com", "STUDENT")).toBe("/student/dashboard");
    expect(getSafePostLoginRedirect("//evil.com/login", "FACULTY")).toBe("/faculty/dashboard");
    expect(getSafePostLoginRedirect("///evil.com", "MENTOR")).toBe("/mentor/dashboard");
  });

  it("blocks absolute URL and scheme-based open-redirect attempts", () => {
    expect(getSafePostLoginRedirect("https://attacker.com", "STUDENT")).toBe("/student/dashboard");
    expect(getSafePostLoginRedirect("http://attacker.com/faculty", "FACULTY")).toBe(
      "/faculty/dashboard",
    );
    expect(getSafePostLoginRedirect("javascript:alert(1)", "MENTOR")).toBe("/mentor/dashboard");
  });

  it("blocks backslash-based open-redirect attempts", () => {
    expect(getSafePostLoginRedirect("/\\attacker.com", "STUDENT")).toBe("/student/dashboard");
    expect(getSafePostLoginRedirect("\\\\attacker.com", "FACULTY")).toBe("/faculty/dashboard");
  });

  it("blocks authority @ symbol redirect tricks", () => {
    expect(getSafePostLoginRedirect("/student@attacker.com", "STUDENT")).toBe("/student/dashboard");
  });

  it("prevents cross-role unauthorized path redirection", () => {
    // STUDENT cannot be redirected into faculty or mentor portals
    expect(getSafePostLoginRedirect("/faculty/dashboard", "STUDENT")).toBe("/student/dashboard");
    expect(getSafePostLoginRedirect("/mentor/dashboard", "STUDENT")).toBe("/student/dashboard");

    // FACULTY cannot be redirected into mentor portal
    expect(getSafePostLoginRedirect("/mentor/dashboard", "FACULTY")).toBe("/faculty/dashboard");

    // MENTOR cannot be redirected into faculty course management
    expect(getSafePostLoginRedirect("/faculty/courses/cuid-1", "MENTOR")).toBe("/mentor/dashboard");

    // HOD cannot be redirected into student, mentor, or admin portals
    expect(getSafePostLoginRedirect("/student/dashboard", "HOD")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect("/mentor/dashboard", "HOD")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect("/admin/dashboard", "HOD")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect("/admin/users", "HOD")).toBe("/hod/dashboard");

    // ADMIN cannot be redirected into student or mentor portals
    expect(getSafePostLoginRedirect("/student/dashboard", "ADMIN")).toBe("/admin/dashboard");
    expect(getSafePostLoginRedirect("/mentor/dashboard", "ADMIN")).toBe("/admin/dashboard");
  });

  it("handles HOD and ADMIN legitimate subpaths and role homes", () => {
    // HOD allowed on /hod subpaths
    expect(getSafePostLoginRedirect("/hod/escalations", "HOD")).toBe("/hod/escalations");
    expect(getSafePostLoginRedirect("/hod/students", "HOD")).toBe("/hod/students");
    expect(getSafePostLoginRedirect("/hod/dashboard", "HOD")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect(null, "HOD")).toBe("/hod/dashboard");

    // ADMIN allowed on both /admin and /hod subpaths
    expect(getSafePostLoginRedirect("/admin/users", "ADMIN")).toBe("/admin/users");
    expect(getSafePostLoginRedirect("/admin/dashboard", "ADMIN")).toBe("/admin/dashboard");
    expect(getSafePostLoginRedirect("/hod/dashboard", "ADMIN")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect(null, "ADMIN")).toBe("/admin/dashboard");
  });

  it("defaults to role home when next param is empty or missing", () => {
    expect(getSafePostLoginRedirect(null, "MENTOR")).toBe("/mentor/dashboard");
    expect(getSafePostLoginRedirect("", "FACULTY")).toBe("/faculty/dashboard");
    expect(getSafePostLoginRedirect(undefined, "STUDENT")).toBe("/student/dashboard");
    expect(getSafePostLoginRedirect(undefined, "HOD")).toBe("/hod/dashboard");
    expect(getSafePostLoginRedirect(undefined, "ADMIN")).toBe("/admin/dashboard");
  });
});
