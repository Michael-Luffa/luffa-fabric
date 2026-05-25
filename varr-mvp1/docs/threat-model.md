# Threat Model

## Protected Assets

- Agent identity and status
- Capability grants
- Context boundaries and namespaces
- Execution receipts
- Feedback and learning signals
- Wallet and private credential material

## MVP1 Controls

- Agents cannot execute unless active.
- Capabilities must be active, unexpired, and action-covering.
- Contexts must be active, `community_public`, same-namespace, and subject-allowlisted.
- Critical actions are denied before adapter execution.
- High-risk actions are routed to approval.
- Adapter calls require runtime authorization.
- Receipts are append-only records.
- Feedback requires an existing receipt.

## Out of Scope

MVP1 does not provide production sandboxing, settlement, marketplace policy, or real model training. It creates the structural hooks those systems can consume later.
