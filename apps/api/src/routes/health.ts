import { FastifyPluginAsync } from "fastify";
import { prisma } from "@student-academic-ai/database";
import { Redis } from "ioredis";

export interface DatabaseClient {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
}

export interface RedisPingClient {
  ping: () => Promise<string>;
}

export interface HealthRouteOptions {
  db?: DatabaseClient;
  redis?: RedisPingClient | "disabled" | null;
}

let defaultRedisClient: Redis | null = null;

function getDefaultRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisUrl.trim() === "") {
    return null;
  }

  if (!defaultRedisClient) {
    defaultRedisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: false,
      retryStrategy: () => null,
    });
  }
  return defaultRedisClient;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

export const healthRoutes: FastifyPluginAsync<HealthRouteOptions> = async (
  fastify,
  opts,
) => {
  const handleHealth = async (_request: unknown, reply: { status: (code: number) => { send: (body: unknown) => unknown } }) => {
    let dbStatus: "up" | "down" = "down";
    let redisStatus: "up" | "down" | "disabled" = "disabled";

    // 1. Run real SELECT 1 against PostgreSQL with 2s timeout
    try {
      const dbClient = opts?.db ?? prisma;
      await withTimeout(dbClient.$queryRaw`SELECT 1`, 2000);
      dbStatus = "up";
    } catch {
      dbStatus = "down";
    }

    // 2. Redis probe (OPTIONAL)
    // If REDIS_URL is unset and no mock redis provided, do not create Redis client
    let redisClient: RedisPingClient | null = null;
    if (opts?.redis !== undefined) {
      redisClient =
        opts.redis === "disabled" || opts.redis === null ? null : opts.redis;
    } else {
      redisClient = getDefaultRedisClient();
    }

    if (!redisClient) {
      redisStatus = "disabled";
    } else {
      try {
        const pong = await withTimeout(redisClient.ping(), 2000);
        redisStatus = pong === "PONG" ? "up" : "down";
      } catch {
        redisStatus = "down";
      }
    }

    // When Redis is disabled: 200 { status: "ok", db: "up", redis: "disabled" } if DB passes
    const isHealthy =
      redisStatus === "disabled"
        ? dbStatus === "up"
        : dbStatus === "up" && redisStatus === "up";

    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? "ok" : "degraded",
      db: dbStatus,
      redis: redisStatus,
    });
  };

  fastify.get("/health", handleHealth);
  fastify.get("/api/health", handleHealth);
};
