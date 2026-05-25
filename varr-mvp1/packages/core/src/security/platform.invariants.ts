import { findSecretMaterial } from "./sanitizer.ts";

export type PlatformInvariantResult = {
  ok: boolean;
  violations: string[];
};

export function checkNoPrivateCredentialMaterial(value: unknown): PlatformInvariantResult {
  const violations = findSecretMaterial(value);
  return {
    ok: violations.length === 0,
    violations
  };
}
