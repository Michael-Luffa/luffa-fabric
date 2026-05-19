#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { LAEL } from "../core/index.js";
import { createMcpTools } from "./tools.js";

async function main(): Promise<void> {
  const lael = new LAEL({ path: process.env.LAEL_DB_PATH ?? "./lael.db" });
  const { tools, callTool } = createMcpTools(lael);

  const server = new Server(
    {
      name: "@luffa/lael",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return (await callTool(request.params.name, args)) as never;
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
