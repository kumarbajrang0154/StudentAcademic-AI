import { NextRequest } from "next/server";
import { buildApp } from "@student-academic-ai/api";
import type { FastifyInstance } from "fastify";

declare global {
  var __fastifyApp: FastifyInstance | undefined;
  var __fastifyReadyPromise: Promise<unknown> | undefined;
}

type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

async function getFastifyApp(): Promise<FastifyInstance> {
  if (!globalThis.__fastifyApp) {
    const app = await buildApp({ logger: false });
    globalThis.__fastifyApp = app;
    globalThis.__fastifyReadyPromise = Promise.resolve(app.ready());
  }
  await globalThis.__fastifyReadyPromise;
  return globalThis.__fastifyApp;
}

export async function handleFastifyRequest(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const fastifyUrl = url.pathname + url.search;
  const method = request.method as HttpMethod;

  try {
    const app = await getFastifyApp();

    const headers: Record<string, string | string[]> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let payload: Buffer | undefined = undefined;
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const arrayBuffer = await request.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        payload = Buffer.from(arrayBuffer);
      }
    }

    const injectRes = await app.inject({
      method,
      url: fastifyUrl,
      headers,
      payload,
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(injectRes.headers)) {
      if (value === undefined) continue;
      if (key.toLowerCase() === "set-cookie") {
        if (Array.isArray(value)) {
          for (const cookie of value) {
            responseHeaders.append("set-cookie", cookie);
          }
        } else {
          responseHeaders.append("set-cookie", String(value));
        }
      } else if (Array.isArray(value)) {
        for (const v of value) {
          responseHeaders.append(key, v);
        }
      } else {
        responseHeaders.set(key, String(value));
      }
    }

    return new Response(injectRes.rawPayload as unknown as BodyInit, {
      status: injectRes.statusCode,
      headers: responseHeaders,
    });
  } catch {
    console.error(`HTTP 500 ${url.pathname}`);
    return new Response(
      JSON.stringify({
        statusCode: 500,
        error: "Internal Server Error",
        message: "An internal server error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
