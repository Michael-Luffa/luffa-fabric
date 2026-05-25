import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createEmptySnapshot,
  createMemoryRepositories,
  snapshotRepositories
} from "../../../core/src/storage/memory.repository.ts";
import type { LaelRepositories, RepositorySnapshot } from "../../../core/src/storage/repository.interface.ts";

const statePath = resolve(process.cwd(), ".lael", "state.json");

export async function initWorkspace(): Promise<string> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(createEmptySnapshot(), null, 2));
  return statePath;
}

export async function loadRepositories(): Promise<LaelRepositories> {
  const snapshot = await loadSnapshot();
  return createMemoryRepositories(snapshot);
}

export async function saveRepositories(repositories: LaelRepositories): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(await snapshotRepositories(repositories), null, 2));
}

export async function loadSnapshot(): Promise<RepositorySnapshot> {
  try {
    const text = await readFile(statePath, "utf8");
    return JSON.parse(text) as RepositorySnapshot;
  } catch {
    return createEmptySnapshot();
  }
}

export function currentStatePath(): string {
  return statePath;
}
