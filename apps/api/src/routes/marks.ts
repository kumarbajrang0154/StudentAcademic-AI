import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  requireRole,
  AuthUser,
} from "../lib/rbac.js";
import { recordMarksBatch } from "../services/faculty.service.js";

const MarksBatchSchema = z.object({
  assessmentId: z.string().min(1, "Assessment ID is required"),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1, "Student ID is required"),
        score: z.number().min(0, "Score cannot be negative"),
      }),
    )
    .min(1, "At least one marks entry is required"),
  justification: z.string().optional(),
});

export const marksRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/marks/batch
  app.post(
    "/batch",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = MarksBatchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid marks batch payload",
        });
      }

      const { assessmentId, entries, justification } = parseResult.data;

      try {
        const result = await recordMarksBatch(
          assessmentId,
          entries,
          justification,
          user,
        );
        return reply.status(200).send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 400 ? "Bad Request" : statusCode === 403 ? "Forbidden" : statusCode === 404 ? "Not Found" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to record marks batch",
        });
      }
    },
  );
};
