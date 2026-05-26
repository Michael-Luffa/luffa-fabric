import { describe, expect, it } from "vitest";
import { buildServer } from "../src/api/server.js";

describe("Core API deployment surface", () => {
  it("exposes a health endpoint", async () => {
    const { app } = await buildServer({ path: ":memory:" });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "luffa-fabric-core-api",
    });

    await app.close();
  });

  it("adds CORS headers for the Vercel demo origin", async () => {
    const { app } = await buildServer({ path: ":memory:" });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/agents/register",
      headers: {
        origin: "https://luffa-fabric-interactive-demo.vercel.app",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://luffa-fabric-interactive-demo.vercel.app",
    );
    expect(response.headers["access-control-allow-methods"]).toContain("POST");

    await app.close();
  });
});
