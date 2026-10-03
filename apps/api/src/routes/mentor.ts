import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole, AuthUser } from "../lib/rbac.js";
import {
  getMentorOverview,
  getMentorMenteesList,
  getMenteeDetail,
  getMenteeNotes,
  createMenteeNote,
  createEscalationRequest,
  getMentorEscalationRequests,
} from "../services/mentor.service.js";

const NoteCreateSchema = z.object({
  body: z.string().trim().min(1, "Note cannot be empty").max(2000, "Note cannot exceed 2000 characters"),
});

const EscalationCreateSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  reason: z.string().trim().min(1, "Reason is required").max(1000, "Reason cannot exceed 1000 characters"),
});

export const mentorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/mentor/overview
  app.get(
    "/overview",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      try {
        const overview = await getMentorOverview(user);
        return reply.send({ status: "ok", overview });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load mentor overview",
        });
      }
    },
  );

  // GET /api/v1/mentor/mentees
  app.get(
    "/mentees",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { search, risk, sort } = request.query as {
        search?: string;
        risk?: string;
        sort?: string;
      };
      try {
        const mentees = await getMentorMenteesList(user, { search, risk, sort });
        return reply.send({ status: "ok", mentees });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load mentees",
        });
      }
    },
  );

  // GET /api/v1/mentor/mentees/:studentId
  app.get(
    "/mentees/:studentId",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { studentId } = request.params as { studentId: string };
      try {
        const mentee = await getMenteeDetail(user, studentId);
        return reply.send({ status: "ok", mentee });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load mentee";
        if (msg === "FORBIDDEN_NOT_MENTEE") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Student is not assigned as your mentee",
          });
        }
        if (msg === "STUDENT_NOT_FOUND") {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Student not found",
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

  // GET /api/v1/mentor/mentees/:studentId/notes
  app.get(
    "/mentees/:studentId/notes",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { studentId } = request.params as { studentId: string };
      try {
        const notes = await getMenteeNotes(user, studentId);
        return reply.send({ status: "ok", notes });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load notes";
        if (msg === "FORBIDDEN_NOT_MENTEE") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Student is not assigned as your mentee",
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

  // POST /api/v1/mentor/mentees/:studentId/notes
  app.post(
    "/mentees/:studentId/notes",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { studentId } = request.params as { studentId: string };

      const parseResult = NoteCreateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message || "Invalid note data",
        });
      }

      try {
        const note = await createMenteeNote(user, studentId, parseResult.data.body);
        return reply.status(201).send({ status: "ok", note });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to create note";
        if (msg === "FORBIDDEN_NOT_MENTEE") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Student is not assigned as your mentee",
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

  // POST /api/v1/mentor/escalation-requests
  app.post(
    "/escalation-requests",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = EscalationCreateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message || "Invalid escalation request",
        });
      }

      try {
        const escalation = await createEscalationRequest(
          user,
          parseResult.data.studentId,
          parseResult.data.reason,
        );
        return reply.status(201).send({ status: "ok", escalation });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to create escalation";
        if (msg === "FORBIDDEN_NOT_MENTEE") {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Student is not assigned as your mentee",
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

  // GET /api/v1/mentor/escalation-requests
  app.get(
    "/escalation-requests",
    { preHandler: [requireRole("MENTOR", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      try {
        const escalations = await getMentorEscalationRequests(user);
        return reply.send({ status: "ok", escalations });
      } catch (err: unknown) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load escalations",
        });
      }
    },
  );
};
