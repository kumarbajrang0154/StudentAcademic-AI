import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { InterventionStatus } from "@student-academic-ai/database";
import { authenticate, requireRole, AuthUser } from "../lib/rbac.js";
import {
  scheduleIntervention,
  getInterventionsList,
  updateIntervention,
  generateInterventionIcs,
} from "../services/mentor.service.js";

const ScheduleInterventionSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  courseId: z.string().optional(),
  title: z.string().trim().max(200).optional(),
  notes: z.string().max(2000).optional(),
  scheduledAt: z.string().optional(), // ISO or local datetime-local value
  durationMin: z.number().int().min(15).max(180).optional(),
});

const UpdateInterventionSchema = z.object({
  status: z.nativeEnum(InterventionStatus).optional(),
  notes: z.string().max(2000).optional(),
  actionItems: z.any().optional(),
});

export const interventionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // POST /api/v1/interventions
  app.post(
    "/",
    { preHandler: [requireRole("MENTOR", "ADMIN", "FACULTY")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = ScheduleInterventionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message || "Invalid intervention data",
        });
      }

      try {
        const result = await scheduleIntervention(user, parseResult.data);
        return reply.status(201).send({ status: "ok", intervention: result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to schedule intervention";
        if (msg === "FORBIDDEN_NOT_MENTEE") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Student is not assigned as your mentee",
          });
        }
        if (msg.startsWith("NO_SLOT_AVAILABLE")) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: msg,
          });
        }
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: msg,
        });
      }
    },
  );

  // GET /api/v1/interventions
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { status } = request.query as { status?: string };
      try {
        const interventions = await getInterventionsList(user, status);
        return reply.send({ status: "ok", interventions });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load interventions",
        });
      }
    },
  );

  // PATCH /api/v1/interventions/:id
  app.patch(
    "/:id",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params as { id: string };

      const parseResult = UpdateInterventionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message || "Invalid update data",
        });
      }

      try {
        const updated = await updateIntervention(user, id, parseResult.data);
        return reply.send({ status: "ok", intervention: updated });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to update intervention";
        if (msg === "NOT_FOUND") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Intervention not found",
          });
        }
        if (msg === "FORBIDDEN") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You can only update your own interventions",
          });
        }
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: msg,
        });
      }
    },
  );

  // GET /api/v1/interventions/:id/ics
  app.get(
    "/:id/ics",
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const icsContent = await generateInterventionIcs(id);
        reply.header("Content-Type", "text/calendar; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="mentoring-session-${id}.ics"`);
        return reply.send(icsContent);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to generate ICS";
        if (msg === "NOT_FOUND") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Intervention not found",
          });
        }
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: msg,
        });
      }
    },
  );
};
