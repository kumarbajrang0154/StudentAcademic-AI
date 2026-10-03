import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { prisma } from "@student-academic-ai/database";
import { authenticate, AuthUser } from "../lib/rbac.js";

export const notificationRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/notifications
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { page = "1", limit = "20" } = request.query as {
        page?: string;
        limit?: string;
      };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      try {
        const [notifications, total, unreadCount] = await Promise.all([
          prisma.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            skip,
            take: limitNum,
          }),
          prisma.notification.count({ where: { userId: user.id } }),
          prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        ]);

        return reply.send({
          status: "ok",
          notifications,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            unreadCount,
          },
        });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to load notifications",
        });
      }
    },
  );

  // POST /api/v1/notifications/:id/read
  app.post(
    "/:id/read",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;
      const { id } = request.params as { id: string };

      try {
        const notification = await prisma.notification.findUnique({
          where: { id },
        });

        if (!notification) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Notification not found",
          });
        }

        if (notification.userId !== user.id) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "You can only modify your own notifications",
          });
        }

        const updated = await prisma.notification.update({
          where: { id },
          data: { readAt: new Date(), status: "DELIVERED" },
        });

        return reply.send({ status: "ok", notification: updated });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to mark notification as read",
        });
      }
    },
  );

  // POST /api/v1/notifications/read-all
  app.post(
    "/read-all",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as AuthUser;

      try {
        await prisma.notification.updateMany({
          where: {
            userId: user.id,
            readAt: null,
          },
          data: {
            readAt: new Date(),
            status: "DELIVERED",
          },
        });

        return reply.send({ status: "ok", message: "All notifications marked as read" });
      } catch (err: unknown) {
        request.log.error(err);
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: err instanceof Error ? err.message : "Failed to mark all notifications as read",
        });
      }
    },
  );
};
