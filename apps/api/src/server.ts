import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { healthRoutes, HealthRouteOptions } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
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
    origin: true,
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
