import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";

export async function handleLearningRoute(method: string, parts: string[], receiptId: string | null, repositories: LaelRepositories): Promise<unknown | undefined> {
  if (method !== "GET") {
    return undefined;
  }
  if (parts.length === 2 && receiptId) {
    return repositories.learningSignals.listByReceipt(receiptId);
  }
  if (parts.length === 3 && parts[2] !== "signals") {
    return repositories.learningSignals.get(decodeURIComponent(parts[2]));
  }
  if (parts.length === 3 && parts[2] === "signals" && receiptId) {
    return repositories.learningSignals.listByReceipt(receiptId);
  }
  if (parts.length === 4 && parts[2] === "signals") {
    return repositories.learningSignals.get(decodeURIComponent(parts[3]));
  }
  return undefined;
}
