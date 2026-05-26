import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { LAEL, type LaelOptions } from "../core/index.js";
import { registerRoutes } from "./routes.js";

export async function buildServer(options: LaelOptions = {}) {
  const lael = new LAEL(options);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  registerCors(app);
  registerHealth(app);
  await registerRoutes(app, lael);

  app.addHook("onClose", async () => {
    lael.close();
  });

  return { app, lael };
}

export async function startServer(options: LaelOptions = {}): Promise<void> {
  const { app } = await buildServer(options);
  const host = process.env.LAEL_HOST ?? process.env.HOST ?? (isHostedRuntime() ? "0.0.0.0" : "127.0.0.1");
  const port = Number(process.env.PORT ?? process.env.LAEL_PORT ?? 3000);
  await app.listen({ host, port });
}

function registerHealth(app: FastifyInstance) {
  app.get("/health", async () => ({
    ok: true,
    service: "luffa-fabric-core-api",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));
}

function registerCors(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    const allowedOrigin = getAllowedOrigin(origin);

    if (allowedOrigin) {
      reply.header("Access-Control-Allow-Origin", allowedOrigin);
      reply.header("Vary", "Origin");
    }

    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    reply.header(
      "Access-Control-Allow-Headers",
      request.headers["access-control-request-headers"] ?? "Content-Type, Authorization",
    );
    reply.header("Access-Control-Max-Age", "86400");

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }
  });
}

function getAllowedOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;

  const allowedOrigins = parseAllowedOrigins();
  if (allowedOrigins.includes("*")) return "*";
  if (allowedOrigins.includes(origin)) return origin;

  return undefined;
}

function parseAllowedOrigins(): string[] {
  const configured = process.env.LAEL_CORS_ORIGINS ?? process.env.CORS_ORIGINS;
  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://luffa-fabric-interactive-demo.vercel.app",
  ];
}

function isHostedRuntime(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME || process.env.PORT);
}
