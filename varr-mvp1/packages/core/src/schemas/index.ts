export class ValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = [message]) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: string[] };

export function parseWith<T>(name: string, input: unknown, validator: (input: unknown) => ValidationResult<T>): T {
  const result = validator(input);
  if (!result.ok) {
    throw new ValidationError(`${name} validation failed`, result.issues);
  }
  return result.value;
}

export function validationOk<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function validationIssues<T = never>(issues: string[]): ValidationResult<T> {
  return { ok: false, issues };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(input: Record<string, unknown>, key: string, issues: string[]): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${key} is required`);
    return "";
  }
  return value;
}

export function optionalString(input: Record<string, unknown>, key: string, issues: string[]): string | undefined {
  const value = input[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    issues.push(`${key} must be a string`);
    return undefined;
  }
  return value;
}

export function requiredStringArray(input: Record<string, unknown>, key: string, issues: string[]): string[] {
  const value = input[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    issues.push(`${key} must be an array of strings`);
    return [];
  }
  return [...value];
}

export function optionalStringArray(input: Record<string, unknown>, key: string, issues: string[]): string[] {
  const value = input[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    issues.push(`${key} must be an array of strings`);
    return [];
  }
  return [...value];
}

export function requiredRecord(input: Record<string, unknown>, key: string, issues: string[]): Record<string, unknown> {
  const value = input[key];
  if (!isRecord(value)) {
    issues.push(`${key} must be an object`);
    return {};
  }
  return value;
}

export function optionalRecord(input: Record<string, unknown>, key: string, issues: string[]): Record<string, unknown> {
  const value = input[key];
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    issues.push(`${key} must be an object`);
    return {};
  }
  return value;
}

export function optionalBoolean(input: Record<string, unknown>, key: string, defaultValue: boolean, issues: string[]): boolean {
  const value = input[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "boolean") {
    issues.push(`${key} must be a boolean`);
    return defaultValue;
  }
  return value;
}

export function optionalNumber(input: Record<string, unknown>, key: string, defaultValue: number, issues: string[]): number {
  const value = input[key];
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push(`${key} must be a number`);
    return defaultValue;
  }
  return value;
}

export function requireLiteral(input: Record<string, unknown>, key: string, literal: string, issues: string[]): void {
  if (input[key] !== literal) {
    issues.push(`${key} must be ${literal}`);
  }
}

export function requireOneOf(input: Record<string, unknown>, key: string, values: readonly string[], issues: string[]): string {
  const value = input[key];
  if (typeof value !== "string" || !values.includes(value)) {
    issues.push(`${key} must be one of: ${values.join(", ")}`);
    return "";
  }
  return value;
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}
