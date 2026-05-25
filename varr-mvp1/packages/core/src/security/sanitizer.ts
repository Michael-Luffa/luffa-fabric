import { isRecord } from "../schemas/index.ts";
import { isForbiddenAction } from "./forbidden.actions.ts";

const forbiddenSecretKeys = new Set([
  "seedphrase",
  "seedphrases",
  "mnemonic",
  "mnemonics",
  "privatekey",
  "privatekeys",
  "walletprivatekey",
  "rawwalletcredential",
  "rawwalletcredentials"
]);

const possibleSecretValuePattern =
  /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|0x[a-f0-9]{64,}|[A-Za-z0-9+/]{80,}={0,2})/i;

export function findSecretMaterial(value: unknown, path = "$"): string[] {
  const issues: string[] = [];
  inspect(value, path, issues);
  return issues;
}

export function assertNoSecretMaterial(value: unknown): void {
  const issues = findSecretMaterial(value);
  if (issues.length > 0) {
    throw new Error(`Private credential material is not accepted: ${issues.join("; ")}`);
  }
}

function inspect(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`, issues));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (forbiddenSecretKeys.has(normalizedKey)) {
        issues.push(`${path}.${key} uses a private credential field`);
      }
      inspect(nested, `${path}.${key}`, issues);
    }
    return;
  }

  if (typeof value !== "string") {
    return;
  }

  if (isForbiddenAction(value)) {
    return;
  }

  if (possibleSecretValuePattern.test(value)) {
    issues.push(`${path} looks like private credential material`);
  }
}
