import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadFixture<T>(name: string): T {
  const path = resolve(process.cwd(), "fixtures", name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
