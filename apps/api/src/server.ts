import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : true,
  });

  await app.register(cors, {
    origin: "*",
  });

  await app.register(healthRoutes);

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
