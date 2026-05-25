# VARR MVP1: Trusted Agent Execution Loop

VARR MVP1 is the LAEL / Luffa Fabric sidecar runtime for context-bounded, capability-scoped AI agent execution.

It proves the smallest trusted loop:

```text
One Agent
-> One DID
-> One Capability
-> One Context Boundary
-> One Workflow
-> One Controlled Execution
-> One ExecutionReceipt
-> One Feedback Signal
-> Zero Private-Key Exposure
```

## What It Does

- Registers and validates `AgentResource`.
- Grants and enforces scoped `CapabilityGrant`.
- Defines public community `ContextResource` boundaries.
- Defines linear `WorkflowResource` execution plans.
- Routes execution only through `RuntimeOrchestrator`.
- Denies critical actions before adapter execution.
- Routes high-risk actions to `pending_approval`.
- Generates an `ExecutionReceipt` for every path.
- Accepts feedback only against valid receipts.
- Emits learning-ready signals from receipt plus feedback.
- Rejects seed phrases, private keys, mnemonics, and raw wallet credentials before storage.

## Runtime Flow

```text
Resolve Agent
-> Validate Agent Status
-> Load Workflow
-> Classify Critical Risk
-> Load Context
-> Check Context Boundary
-> Validate Capability
-> Apply Approval Gate
-> Execute via Adapter
-> Generate ExecutionReceipt
-> Accept Feedback
-> Emit LearningSignal
```

## Quickstart

```bash
pnpm test
pnpm demo
```

Expected demo result:

```text
Execution status: success
Receipt generated: receipt_001
Feedback accepted: yes
Learning signal emitted: yes
Private key exposure: no
Context boundary respected: yes
```

## CLI

```bash
lael init
lael agent register ./examples/community-summary-agent/agent.json
lael capability grant ./examples/community-summary-agent/capability.json
lael context create ./examples/community-summary-agent/context.json
lael workflow create ./examples/community-summary-agent/workflow.yaml
lael execute ./examples/community-summary-agent/execute.json
lael receipt get receipt_001
lael feedback submit ./examples/community-summary-agent/feedback.json
lael learning signal --receipt receipt_001
```

## Security Invariants

- `RuntimeOrchestrator` is the only trusted execution path.
- Adapters require runtime authorization from `ExecutionRunner`.
- Forbidden actions are hard-denied.
- High-risk actions return `pending_approval`.
- Every runtime path appends an `ExecutionReceipt`.
- Feedback must reference a valid receipt.
- Learning signals require receipt plus feedback.
- Private credential material is rejected before storage.

## Tests

The current suite covers validators, capability checks, context boundaries, risk classification, happy path execution, high-risk approval gating, critical denial, feedback validation, receipt creation for every path, and direct adapter bypass protection.

```bash
pnpm test
```

Latest local verification:

```text
19 tests passed
0 failed
```
