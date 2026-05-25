export const FORBIDDEN_ACTIONS = [
  "access_seed_phrase",
  "export_private_key",
  "sign_transaction_directly",
  "read_private_message_without_capability",
  "export_user_data_bulk",
  "execute_unrestricted_shell",
  "bypass_policy",
  "bypass_receipt",
  "bypass_context_boundary"
] as const;

export type ForbiddenAction = (typeof FORBIDDEN_ACTIONS)[number];

const forbiddenActionSet = new Set<string>(FORBIDDEN_ACTIONS);

export function isForbiddenAction(action: string): boolean {
  return forbiddenActionSet.has(action);
}
