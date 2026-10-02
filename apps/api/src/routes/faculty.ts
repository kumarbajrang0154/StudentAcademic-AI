import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  requireRole,
  AuthUser,
} from "../lib/rbac.js";
import {
  getFacultyCourses,
  getCourseRoster,
  getCourseGradebook,
  createAssessment,
  parseFacultyVoice,
  getMentorMentees,
} from "../services/faculty.service.js";

const AssessmentCreateSchema = z.object({
  courseId: z.string().min(1, "Course ID is required"),
  title: z.string().min(1, "Title is required"),
  maxScore: z.number().positive("Max score must be greater than 0"),
  weight: z.number().min(0).max(100, "Weight must be between 0 and 100"),
  type: z.string().optional(),
  dueDate: z.string().optional(),
});

const VoiceParseSchema = z.object({
  transcript: z.string().min(1, "Transcript cannot be empty"),
  courseId: z.string().min(1, "Course ID is required"),
  mode: z.enum(["ATTENDANCE", "MARKS"]),
  speechConfidence: z.number().min(0).max(1).optional(),
  maxScore: z.number().positive().optional(),
});

export const facultyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/faculty/courses
  app.get(
    "/courses",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      try {
        const courses = await getFacultyCourses(user);
        return reply.send({ status: "ok", courses });
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? "Forbidden" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load faculty courses",
        });
      }
    },
  );

  // GET /api/v1/faculty/courses/:id/roster
  app.get(
    "/courses/:id/roster",
    { preHandler: [requireRole("FACULTY", "MENTOR", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params as { id: string };

      try {
        const rosterData = await getCourseRoster(id, user);
        return reply.send(rosterData);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? "Forbidden" : statusCode === 404 ? "Not Found" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load course roster",
        });
      }
    },
  );

  // GET /api/v1/faculty/courses/:id/gradebook
  app.get(
    "/courses/:id/gradebook",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params as { id: string };

      try {
        const gradebook = await getCourseGradebook(id, user);
        return reply.send(gradebook);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 403 ? "Forbidden" : statusCode === 404 ? "Not Found" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load gradebook",
        });
      }
    },
  );

  // POST /api/v1/faculty/assessments
  app.post(
    "/assessments",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const parseResult = AssessmentCreateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid assessment data",
        });
      }

      const { courseId, title, maxScore, weight, type, dueDate } = parseResult.data;

      try {
        const assessment = await createAssessment(
          courseId,
          {
            title,
            maxScore,
            weight,
            type,
            dueDate: dueDate ? new Date(dueDate) : undefined,
          },
          user,
        );
        return reply.status(201).send({ assessment });
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 400 ? "Bad Request" : statusCode === 403 ? "Forbidden" : "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to create assessment",
        });
      }
    },
  );

  // POST /api/v1/faculty/voice/parse
  app.post(
    "/voice/parse",
    { preHandler: [requireRole("FACULTY", "HOD", "ADMIN")] },
    async (request, reply) => {
      const parseResult = VoiceParseSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.errors[0]?.message ?? "Invalid voice parse request",
        });
      }

      const { transcript, courseId, mode, speechConfidence, maxScore } = parseResult.data;

      try {
        const result = await parseFacultyVoice(
          transcript,
          courseId,
          mode,
          speechConfidence,
          maxScore,
        );
        return reply.send(result);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to parse voice transcript",
        });
      }
    },
  );

  // GET /api/v1/faculty/mentees
  app.get(
    "/mentees",
    { preHandler: [requireRole("MENTOR", "HOD", "ADMIN")] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      try {
        const mentees = await getMentorMentees(user);
        return reply.send({ mentees });
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 500;
        return reply.status(statusCode).send({
          statusCode,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load mentees",
        });
      }
    },
  );
};
