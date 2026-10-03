import "dotenv/config";
import { buildServer, buildApp, BuildServerOptions } from "./server.js";

export { buildServer, buildApp, BuildServerOptions };
export * from "./lib/rbac.js";
export * from "./services/escalation.service.js";
export * from "./services/admin.service.js";
export * from "./services/hod.service.js";
export * from "./services/admin-mgmt.service.js";

const PORT = Number(process.env.PORT) || Number(process.env.API_PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

export async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 Fastify API server running at http://${HOST}:${PORT}`);
    return server;
  } catch (err) {
    console.error("Error starting API server:", err);
    process.exit(1);
  }
}

// Start standalone server only when run directly as the entry script
const arg1 = process.argv[1];
const isDirectRun =
  typeof arg1 === "string" &&
  (arg1.endsWith("index.ts") ||
    arg1.endsWith("index.js") ||
    arg1.includes("apps/api") ||
    arg1.includes("apps\\api"));

if (isDirectRun) {
  start();
}


