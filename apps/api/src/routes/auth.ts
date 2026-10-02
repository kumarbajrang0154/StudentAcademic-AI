import { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma, Role } from "@student-academic-ai/database";
import { authenticate } from "../lib/rbac.js";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const DemoLoginSchema = z.object({
  role: z.enum(["STUDENT", "FACULTY", "MENTOR", "HOD", "ADMIN"]),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GET /demo-status
  app.get("/demo-status", async () => {
    return { demoMode: process.env.DEMO_MODE === "true" };
  });

  // Rate-limiting: 10 requests per minute on login endpoint
  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Invalid login payload",
        });
      }

      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user || !user.passwordHash) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      const matches = await bcrypt.compare(password, user.passwordHash);
      if (!matches) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid credentials",
        });
      }

      const accessToken = app.jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
        },
        { expiresIn: "15m" },
      );

      const rawRefreshToken = crypto.randomBytes(48).toString("hex");
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      reply.setCookie("refreshToken", rawRefreshToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      reply.setCookie("accessToken", accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 15 * 60,
      });

      return reply.send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId,
        },
      });
    },
  );

  // Demo login
  app.post("/demo-login", async (request, reply) => {
    if (process.env.DEMO_MODE !== "true") {
      return reply.status(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Demo login is only available when DEMO_MODE=true",
      });
    }

    const parsed = DemoLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Invalid role specified for demo login",
      });
    }

    const { role } = parsed.data;
    const user = await prisma.user.findFirst({
      where: { role: role as Role },
      orderBy: { email: "asc" },
    });

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `No seeded user found with role ${role}`,
      });
    }

    const accessToken = app.jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      },
      { expiresIn: "15m" },
    );

    const rawRefreshToken = crypto.randomBytes(48).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    reply.setCookie("refreshToken", rawRefreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.setCookie("accessToken", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      },
    });
  });

  // POST /refresh
  app.post("/refresh", async (request, reply) => {
    const rawRefreshToken =
      request.cookies.refreshToken ||
      (request.body as { refreshToken?: string })?.refreshToken;
    if (!rawRefreshToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token missing",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");

    const existingToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existingToken) {
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid refresh token",
      });
    }

    // Reuse detection: if token is revoked, revoke all tokens for this user!
    if (existingToken.revokedAt !== null) {
      await prisma.refreshToken.updateMany({
        where: { userId: existingToken.userId },
        data: { revokedAt: new Date() },
      });
      reply.clearCookie("refreshToken", { path: "/" });
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message:
          "Revoked refresh token reused. All active sessions have been terminated.",
      });
    }

    // Expiration check
    if (existingToken.expiresAt < new Date()) {
      reply.clearCookie("refreshToken", { path: "/" });
      return reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Refresh token expired",
      });
    }

    // Revoke old token
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new rotated token
    const newRawToken = crypto.randomBytes(48).toString("hex");
    const newTokenHash = crypto
      .createHash("sha256")
      .update(newRawToken)
      .digest("hex");
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        userId: existingToken.userId,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    const user = existingToken.user;
    const newAccessToken = app.jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      },
      { expiresIn: "15m" },
    );

    reply.setCookie("refreshToken", newRawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    reply.setCookie("accessToken", newAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 15 * 60,
    });

    return reply.send({
      accessToken: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      },
    });
  });

  // POST /logout
  app.post("/logout", async (request, reply) => {
    const rawRefreshToken =
      request.cookies.refreshToken ||
      (request.body as { refreshToken?: string })?.refreshToken;
    if (rawRefreshToken) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    reply.clearCookie("refreshToken", { path: "/" });
    reply.clearCookie("accessToken", { path: "/" });
    return reply.send({ message: "Logged out successfully" });
  });

  // GET /me
  app.get("/me", { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as { id: string };
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        departmentId: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "User not found",
      });
    }

    return reply.send({ user });
  });
};
