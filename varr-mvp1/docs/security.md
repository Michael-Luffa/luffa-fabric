# Security

MVP1 hard-denies these actions:

```text
access_seed_phrase
export_private_key
sign_transaction_directly
read_private_message_without_capability
export_user_data_bulk
execute_unrestricted_shell
bypass_policy
bypass_receipt
bypass_context_boundary
```

High-risk actions such as `publish`, `external_share`, `payment_intent`, and `large_data_access` return `pending_approval`.

Credential material is rejected by resource validators and feedback validation. The code distinguishes forbidden action names from actual key material so the runtime can create denial receipts for attempts such as `export_private_key`.

Receipts store hashes and policy facts. They do not store private plaintext outputs.
