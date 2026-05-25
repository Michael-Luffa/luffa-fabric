# API

Required endpoints:

```http
POST /v1/agents
GET /v1/agents/{agent_id}
PATCH /v1/agents/{agent_id}
POST /v1/agents/{agent_id}/suspend

POST /v1/capabilities
GET /v1/capabilities/{capability_id}
POST /v1/capabilities/{capability_id}/revoke

POST /v1/contexts
GET /v1/contexts/{context_id}

POST /v1/workflows
GET /v1/workflows/{workflow_id}

POST /v1/execution/intents
POST /v1/execution/run
GET /v1/execution/receipts/{receipt_id}

POST /v1/feedback
GET /v1/feedback/{feedback_id}

GET /v1/learning/signals/{signal_id}
GET /v1/learning/signals?receipt_id={receipt_id}
```

The API routes validate resources and call core services. Execution uses `RuntimeOrchestrator`; route handlers do not call adapters directly.
