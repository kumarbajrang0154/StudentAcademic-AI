import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { runContinuousAnalysis, verifyCronSecret, getRecentAnalysisRuns } from "../services/analysis.service.js";
import { AuthUser } from "../lib/rbac.js";

export const internalRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/internal/analysis/run
   * Protected by header `Authorization: Bearer <CRON_SECRET>` OR valid ADMIN user token.
   * Recomputes all course enrollments in bulk, triggers deadline alerts, and records AnalysisRun.
   */
  app.post("/analysis/run", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    let authorized = false;

    // 1. Check CRON_SECRET bearer token via constant-time compare
    if (authHeader && verifyCronSecret(authHeader)) {
      authorized = true;
    }

    // 2. Check if authenticated user is ADMIN
    if (!authorized) {
      try {
        await request.jwtVerify();
        const user = request.user as AuthUser | undefined;
        if (user && (user.role === "ADMIN" || user.role === "HOD")) {
          authorized = true;
        }
      } catch {
        // Token verification failed or not present
      }
    }

    if (!authorized) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid or missing CRON_SECRET or administrative credentials",
      });
    }

    try {
      const result = await runContinuousAnalysis();
      return reply.send({
        status: "ok",
        result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Continuous analysis failed";
      return reply.status(500).send({
        error: "Internal Server Error",
        message: msg,
      });
    }
  });

  /**
   * GET /api/v1/internal/analysis/runs
   * Returns recent analysis runs.
   */
  app.get("/analysis/runs", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const runs = await getRecentAnalysisRuns(10);
      return reply.send({ runs });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load analysis runs";
      return reply.status(500).send({ error: "Internal Server Error", message: msg });
    }
  });
};
