import dotenv from "dotenv";
import path from "node:path";
import Fastify, { FastifyInstance } from "fastify";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { healthRoutes, HealthRouteOptions } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import {
  studentRoutes,
  attendanceSimulatorRoutes,
  studentRiskRoutes,
} from "./routes/student.js";
import {
  authenticate,
  requireRole,
  PERMISSION_MATRIX,
  AuthUser,
} from "./lib/rbac.js";

export interface BuildServerOptions extends HealthRouteOptions {
  logger?: boolean;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? (process.env.NODE_ENV === "test" ? false : true),
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, smoke tests)
      if (!origin) return cb(null, true);

      const allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4000",
        "http://127.0.0.1:4000",
      ];

      if (process.env.WEB_ORIGIN) {
        const configured = process.env.WEB_ORIGIN.split(",").map((o) =>
          o.trim().replace(/\/+$/, ""),
        );
        allowed.push(...configured);
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (
        allowed.includes(normalizedOrigin) ||
        normalizedOrigin.endsWith(".vercel.app") ||
        process.env.NODE_ENV !== "production"
      ) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret:
      process.env.JWT_SECRET ||
      "dev-secret-super-secure-jwt-key-student-academic-ai-32chars",
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  await app.register(healthRoutes, {
    db: options.db,
    redis: options.redis,
  });

  await app.register(authRoutes, {
    prefix: "/api/v1/auth",
  });

  await app.register(studentRoutes, {
    prefix: "/api/v1/student",
  });

  await app.register(attendanceSimulatorRoutes, {
    prefix: "/api/v1/attendance",
  });

  await app.register(studentRiskRoutes, {
    prefix: "/api/v1/students",
  });

  // Scope introspection endpoint
  app.get(
    "/api/v1/_whoami-scope",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const permissions = PERMISSION_MATRIX[user.role] ?? {};
      return reply.send({
        user,
        permissions,
      });
    },
  );

  // Protected route for RBAC testing (FACULTY, HOD, ADMIN only)
  app.get(
    "/api/v1/faculty/courses",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      return reply.send({
        status: "ok",
        message: "Faculty access granted",
        userRole: user.role,
      });
    },
  );

  // Parent route /p/v endpoint
  app.all("/p/v", async () => {
    return {
      status: "ok",
      service: "parent-portal",
    };
  });
  app.all("/p/v/*", async () => {
    return {
      status: "ok",
      service: "parent-portal",
    };
  });

  // Root welcome endpoint
  app.get("/", async () => {
    return {
      name: "Student Academic AI API",
      status: "operational",
      version: "0.1.0",
    };
  });

  return app;
}

export const buildApp = buildServer;

