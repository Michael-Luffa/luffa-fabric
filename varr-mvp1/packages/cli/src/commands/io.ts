import { readFile } from "node:fs/promises";

export async function readResourceFile(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return parseWorkflowYaml(text);
  }
  return JSON.parse(text);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseWorkflowYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentList: "allowed_agents" | "steps" | undefined;
  let currentStep: Record<string, unknown> | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) {
      continue;
    }

    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();

    if (indent === 0) {
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (key === "allowed_agents") {
        root.allowed_agents = [];
        currentList = "allowed_agents";
      } else if (key === "steps") {
        root.steps = [];
        currentList = "steps";
      } else {
        root[key] = parseScalar(value);
        currentList = undefined;
      }
      continue;
    }

    if (currentList === "allowed_agents" && trimmed.startsWith("- ")) {
      (root.allowed_agents as string[]).push(parseScalar(trimmed.slice(2)) as string);
      continue;
    }

    if (currentList === "steps") {
      if (trimmed.startsWith("- ")) {
        currentStep = {};
        (root.steps as Record<string, unknown>[]).push(currentStep);
        const [key, ...rest] = trimmed.slice(2).split(":");
        currentStep[key] = parseScalar(rest.join(":").trim());
      } else if (currentStep) {
        const [key, ...rest] = trimmed.split(":");
        currentStep[key] = parseScalar(rest.join(":").trim());
      }
    }
  }

  return root;
}

function parseScalar(value: string): unknown {
  if (value === "") {
    return "";
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const numberValue = Number(value);
  if (value !== "" && !Number.isNaN(numberValue) && !value.startsWith("0")) {
    return numberValue;
  }
  return value;
}
