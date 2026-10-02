import "dotenv/config";
import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    const server = await buildServer();
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 Fastify API server running at http://${HOST}:${PORT}`);
  } catch (err) {
    console.error("Error starting API server:", err);
    process.exit(1);
  }
}

start();
