import Fastify from "fastify";
import { LAEL, type LaelOptions } from "../core/index.js";
import { registerRoutes } from "./routes.js";

export async function buildServer(options: LaelOptions = {}) {
  const lael = new LAEL(options);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  await registerRoutes(app, lael);

  app.addHook("onClose", async () => {
    lael.close();
  });

  return { app, lael };
}

export async function startServer(options: LaelOptions = {}): Promise<void> {
  const { app } = await buildServer(options);
  const host = process.env.LAEL_HOST ?? "127.0.0.1";
  const port = Number(process.env.LAEL_PORT ?? 3000);
  await app.listen({ host, port });
}
