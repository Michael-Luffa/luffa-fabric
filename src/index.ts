import { pathToFileURL } from "node:url";
import { startServer } from "./api/server.js";

export * from "./core/index.js";
export * from "./db/index.js";
export * from "./identity/index.js";
export * from "./permission/index.js";
export * from "./execution/index.js";
export * from "./settlement/index.js";
export * from "./settlement/adapters/index.js";
export * from "./wallet/index.js";
export * from "./chains/index.js";
export * from "./learning/index.js";
export * from "./api/server.js";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
