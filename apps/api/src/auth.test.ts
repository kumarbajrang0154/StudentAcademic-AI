import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import type { DatabaseClient } from "./routes/health.js";
import {
  PERMISSION_MATRIX,
  canAccessCourse,
  canViewStudent,
} from "./lib/rbac.js";

const dummyDb: DatabaseClient = {
  $queryRaw: async () => [{ "?column?": 1 }],
};

describe("RBAC Permissions Matrix & Scope Helpers", () => {
  it("verifies exact permission matrix scopes for all roles", () => {
    expect(PERMISSION_MATRIX.STUDENT).toEqual({
      viewSelf: "self",
      editMarks: "none",
      viewCohort: "none",
      editRoster: "none",
      viewAudit: "none",
      systemConfig: "none",
    });

    expect(PERMISSION_MATRIX.FACULTY).toEqual({
      viewSelf: "self",
      editMarks: "assigned",
      viewCohort: "assigned",
      editRoster: "assigned",
      viewAudit: "none",
      systemConfig: "none",
    });

    expect(PERMISSION_MATRIX.MENTOR).toEqual({
      viewSelf: "self",
      editMarks: "none",
      viewCohort: "mentees",
      editRoster: "none",
      viewAudit: "none",
      systemConfig: "none",
    });

    expect(PERMISSION_MATRIX.HOD).toEqual({
      viewSelf: "self",
      editMarks: "dept",
      viewCohort: "dept",
      editRoster: "dept",
      viewAudit: "dept",
      systemConfig: "dept",
    });

    expect(PERMISSION_MATRIX.ADMIN).toEqual({
      viewSelf: "all",
      editMarks: "all",
      viewCohort: "all",
      editRoster: "all",
      viewAudit: "all",
      systemConfig: "all",
    });
  });

  it("canAccessCourse correctly verifies role-based course access", () => {
    const courseA = {
      id: "course-1",
      departmentId: "dept-cse",
      facultyId: "fac-1",
      sessions: [{ facultyId: "fac-1" }],
    };
    const courseB = {
      id: "course-2",
      departmentId: "dept-ece",
      facultyId: "fac-2",
    };

    // Admin
    expect(
      canAccessCourse({ id: "admin-1", role: "ADMIN" }, courseA),
    ).toBe(true);

    // HOD in same vs different department
    expect(
      canAccessCourse(
        { id: "hod-1", role: "HOD", departmentId: "dept-cse" },
        courseA,
      ),
    ).toBe(true);
    expect(
      canAccessCourse(
        { id: "hod-1", role: "HOD", departmentId: "dept-cse" },
        courseB,
      ),
    ).toBe(false);

    // Faculty assigned vs unassigned
    expect(
      canAccessCourse(
        { id: "fac-1", role: "FACULTY", departmentId: "dept-cse" },
        courseA,
      ),
    ).toBe(true);
    expect(
      canAccessCourse(
        { id: "fac-1", role: "FACULTY", departmentId: "dept-cse" },
        courseB,
      ),
    ).toBe(false);

    // Student has no course admin access
    expect(
      canAccessCourse(
        { id: "stud-1", role: "STUDENT", departmentId: "dept-cse" },
        courseA,
      ),
    ).toBe(false);
  });

  it("canViewStudent correctly checks access across all roles", () => {
    const student1 = {
      id: "s-1",
      departmentId: "dept-cse",
      mentorId: "m-1",
      mentorAssignments: [{ mentorId: "m-1", active: true }],
      enrolledCourseFacultyIds: ["fac-1"],
    };

    // Admin can view any student
    expect(canViewStudent({ id: "admin", role: "ADMIN" }, student1)).toBe(true);

    // Student can only view self
    expect(canViewStudent({ id: "s-1", role: "STUDENT" }, student1)).toBe(true);
    expect(canViewStudent({ id: "s-2", role: "STUDENT" }, student1)).toBe(false);

    // Mentor can view assigned mentee, but not unassigned
    expect(canViewStudent({ id: "m-1", role: "MENTOR" }, student1)).toBe(true);
    expect(canViewStudent({ id: "m-2", role: "MENTOR" }, student1)).toBe(false);

    // HOD can view department students
    expect(
      canViewStudent(
        { id: "hod-1", role: "HOD", departmentId: "dept-cse" },
        student1,
      ),
    ).toBe(true);
    expect(
      canViewStudent(
        { id: "hod-2", role: "HOD", departmentId: "dept-ece" },
        student1,
      ),
    ).toBe(false);

    // Faculty can view students they teach
    expect(
      canViewStudent(
        { id: "fac-1", role: "FACULTY", departmentId: "dept-other" },
        student1,
      ),
    ).toBe(true);
  });
});

describe("Auth Routes & Token Management", () => {
  it("rejects unauthorized access without token", async () => {
    const app = await buildServer({ db: dummyDb, redis: "disabled" });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects invalid login credentials with generic error", async () => {
    const app = await buildServer({ db: dummyDb, redis: "disabled" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "nonexistent@demo.edu",
        password: "WrongPassword123",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.message).toBe("Invalid credentials");
    await app.close();
  }, 10000);

  it("handles demo-login when DEMO_MODE is true or false", async () => {
    const prevDemoMode = process.env.DEMO_MODE;

    // Case 1: DEMO_MODE !== "true" -> 404 Not Found
    process.env.DEMO_MODE = "false";
    const appFalse = await buildServer({ db: dummyDb, redis: "disabled" });
    const resFalse = await appFalse.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { role: "STUDENT" },
    });
    expect(resFalse.statusCode).toBe(404);
    const bodyFalse = JSON.parse(resFalse.body);
    expect(bodyFalse.message).toBe("Demo login is disabled");
    await appFalse.close();

    // Case 2: DEMO_MODE === "true" -> 200 OK
    process.env.DEMO_MODE = "true";
    const appTrue = await buildServer({ db: dummyDb, redis: "disabled" });
    const resTrue = await appTrue.inject({
      method: "POST",
      url: "/api/v1/auth/demo-login",
      payload: { role: "STUDENT" },
    });
    expect(resTrue.statusCode).toBe(200);
    const bodyTrue = JSON.parse(resTrue.body);
    expect(bodyTrue.accessToken).toBeDefined();
    expect(bodyTrue.user.role).toBe("STUDENT");
    await appTrue.close();

    process.env.DEMO_MODE = prevDemoMode;
  });

  it("returns demoMode boolean on GET /api/v1/auth/config and /demo-status", async () => {
    const prevDemoMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";

    const app = await buildServer({ db: dummyDb, redis: "disabled" });
    const responseConfig = await app.inject({
      method: "GET",
      url: "/api/v1/auth/config",
    });
    expect(responseConfig.statusCode).toBe(200);
    expect(JSON.parse(responseConfig.body)).toEqual({ demoMode: true });

    const responseStatus = await app.inject({
      method: "GET",
      url: "/api/v1/auth/demo-status",
    });
    expect(responseStatus.statusCode).toBe(200);
    expect(JSON.parse(responseStatus.body)).toEqual({ demoMode: true });

    process.env.DEMO_MODE = "false";
    const resConfigFalse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/config",
    });
    expect(resConfigFalse.statusCode).toBe(200);
    expect(JSON.parse(resConfigFalse.body)).toEqual({ demoMode: false });

    process.env.DEMO_MODE = prevDemoMode;
    await app.close();
  });

  it("enforces rate limit of 10 attempts on /login returning 429", async () => {
    const app = await buildServer({ db: dummyDb, redis: "disabled" });

    // Send 12 concurrent login attempts with same IP and email
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        app.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: {
            email: "ratelimit.test@demo.edu",
            password: "wrong-password",
          },
        }),
      ),
    );

    const rateLimited = responses.filter((r) => r.statusCode === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
    const parsed = JSON.parse(rateLimited[0]!.body);
    expect(parsed.message).toContain("Too many login attempts");

    await app.close();
  }, 20000);

  it("enforces role guards on protected faculty route", async () => {
    const app = await buildServer({ db: dummyDb, redis: "disabled" });

    // Generate student token
    const studentToken = app.jwt.sign({
      id: "student-1",
      email: "student01@demo.edu",
      name: "Student 01",
      role: "STUDENT",
    });

    const studentRes = await app.inject({
      method: "GET",
      url: "/api/v1/faculty/courses",
      headers: {
        authorization: `Bearer ${studentToken}`,
      },
    });

    expect(studentRes.statusCode).toBe(403);
    const studentBody = JSON.parse(studentRes.body);
    expect(studentBody.error).toBe("Forbidden");

    // Generate faculty token
    const facultyToken = app.jwt.sign({
      id: "faculty-1",
      email: "faculty1@demo.edu",
      name: "Prof. Claude Shannon",
      role: "FACULTY",
    });

    const facultyRes = await app.inject({
      method: "GET",
      url: "/api/v1/faculty/courses",
      headers: {
        authorization: `Bearer ${facultyToken}`,
      },
    });

    expect(facultyRes.statusCode).toBe(200);
    const facultyBody = JSON.parse(facultyRes.body);
    expect(facultyBody.status).toBe("ok");

    // Scope introspection endpoint
    const scopeRes = await app.inject({
      method: "GET",
      url: "/api/v1/_whoami-scope",
      headers: {
        authorization: `Bearer ${facultyToken}`,
      },
    });

    expect(scopeRes.statusCode).toBe(200);
    const scopeBody = JSON.parse(scopeRes.body);
    expect(scopeBody.permissions.editMarks).toBe("assigned");

    await app.close();
  });
});
