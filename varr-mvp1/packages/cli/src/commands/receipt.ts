import type { LaelRepositories } from "../../../core/src/storage/repository.interface.ts";
import { printJson } from "./io.ts";

export async function handleReceiptCommand(args: string[], repositories: LaelRepositories): Promise<boolean> {
  const [command, value] = args;
  if (command === "get" && value) {
    printJson(await repositories.receipts.get(value));
    return true;
  }
  return false;
}
