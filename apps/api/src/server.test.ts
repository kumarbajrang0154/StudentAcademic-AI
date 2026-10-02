import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import type { DatabaseClient, RedisPingClient } from "./routes/health.js";

describe("Fastify GET /health - Quality Gate with Dependency Injection", () => {
  const healthyDb: DatabaseClient = {
    $queryRaw: async () => [{ "?column?": 1 }],
  };

  const failingDb: DatabaseClient = {
    $queryRaw: async () => {
      throw new Error("Database connection refused");
    },
  };

  const healthyRedis: RedisPingClient = {
    ping: async () => "PONG",
  };

  const failingRedis: RedisPingClient = {
    ping: async () => {
      throw new Error("Redis connection refused");
    },
  };

  it('Combination 1: returns 200 { status: "ok", db: "up", redis: "up" } when both DB and Redis pass', async () => {
    const app = await buildServer({ db: healthyDb, redis: healthyRedis });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "ok",
      db: "up",
      redis: "up",
    });
    await app.close();
  });

  it('Combination 2: returns 503 { status: "degraded", db: "up", redis: "down" } when Redis fails', async () => {
    const app = await buildServer({ db: healthyDb, redis: failingRedis });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      db: "up",
      redis: "down",
    });
    await app.close();
  });

  it('Combination 3: returns 503 { status: "degraded", db: "down", redis: "up" } when DB fails', async () => {
    const app = await buildServer({ db: failingDb, redis: healthyRedis });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      db: "down",
      redis: "up",
    });
    await app.close();
  });

  it('Combination 4: returns 503 { status: "degraded", db: "down", redis: "down" } when both fail', async () => {
    const app = await buildServer({ db: failingDb, redis: failingRedis });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      db: "down",
      redis: "down",
    });
    await app.close();
  });

  it('Redis Disabled case: returns 200 { status: "ok", db: "up", redis: "disabled" } when Redis is not configured', async () => {
    const app = await buildServer({ db: healthyDb, redis: "disabled" });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: "ok",
      db: "up",
      redis: "disabled",
    });
    await app.close();
  });

  it('Redis Disabled but DB down: returns 503 { status: "degraded", db: "down", redis: "disabled" }', async () => {
    const app = await buildServer({ db: failingDb, redis: "disabled" });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      db: "down",
      redis: "disabled",
    });
    await app.close();
  });

  it("handles timeout when service takes longer than 2 seconds", async () => {
    const timingOutDb: DatabaseClient = {
      $queryRaw: () => new Promise((resolve) => setTimeout(resolve, 3000)),
    };

    const app = await buildServer({ db: timingOutDb, redis: healthyRedis });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      status: "degraded",
      db: "down",
      redis: "up",
    });
    await app.close();
  }, 10000);
});
