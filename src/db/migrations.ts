import type { SqlDatabase } from "./index.js";

export function runMigrations(db: SqlDatabase): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      internal_id TEXT PRIMARY KEY,
      identity_type TEXT NOT NULL,
      external_id TEXT NOT NULL,
      owner_ref TEXT NOT NULL,
      public_key TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      trust_score REAL DEFAULT 0.5,
      risk_level TEXT DEFAULT 'LOW',
      status TEXT DEFAULT 'active',
      verification_proof TEXT,
      metadata TEXT,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL,
      last_active_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_external_id ON agents(external_id);

    CREATE TABLE IF NOT EXISTS capability_tokens (
      token_id TEXT PRIMARY KEY,
      issuer_did TEXT NOT NULL,
      grantee_did TEXT NOT NULL,
      scope TEXT NOT NULL,
      constraints TEXT,
      expires_at TEXT NOT NULL,
      revoked INTEGER DEFAULT 0,
      signature TEXT NOT NULL,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policies (
      policy_id TEXT PRIMARY KEY,
      owner_ref TEXT NOT NULL,
      version TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      json_rules TEXT NOT NULL,
      crypto_commitment TEXT,
      zk_policy_proof TEXT,
      active INTEGER DEFAULT 1,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_policies_owner_active_priority
      ON policies(owner_ref, active, priority DESC);

    CREATE TABLE IF NOT EXISTS permission_audits (
      decision_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action TEXT NOT NULL,
      decision TEXT NOT NULL,
      matched_policy_id TEXT,
      risk_score REAL,
      budget REAL,
      requires_confirmation INTEGER DEFAULT 0,
      context TEXT,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS execution_records (
      execution_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      target_did TEXT,
      action TEXT NOT NULL,
      params TEXT NOT NULL,
      raw_input TEXT,
      result TEXT,
      status TEXT NOT NULL,
      permission_decision_id TEXT NOT NULL,
      settlement_id TEXT,
      chain_type TEXT,
      chain_id TEXT,
      tx_hash TEXT,
      wallet_address TEXT,
      gas_used TEXT,
      block_number INTEGER,
      feedback TEXT,
      merkle_leaf_hash TEXT NOT NULL,
      merkle_root TEXT,
      merkle_index INTEGER,
      zk_proof TEXT,
      tee_attestation TEXT,
      duration_ms INTEGER,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_execution_records_agent_created
      ON execution_records(agent_id, created_at);

    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      did TEXT NOT NULL,
      asset TEXT NOT NULL,
      balance REAL DEFAULT 0,
      frozen INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(did, asset)
    );

    CREATE TABLE IF NOT EXISTS settlement_records (
      settlement_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      payer_did TEXT NOT NULL,
      payee_did TEXT NOT NULL,
      asset TEXT NOT NULL,
      amount REAL NOT NULL,
      rail TEXT NOT NULL,
      status TEXT NOT NULL,
      transaction_ref TEXT,
      chain_type TEXT,
      chain_id TEXT,
      tx_hash TEXT,
      wallet_address TEXT,
      gas_used TEXT,
      block_number INTEGER,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reputation (
      agent_id TEXT PRIMARY KEY,
      score REAL DEFAULT 0.5,
      feedback_count INTEGER DEFAULT 0,
      dp_epsilon REAL,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback_records (
      feedback_id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      score REAL NOT NULL,
      normalized_score REAL NOT NULL,
      comment TEXT,
      applied INTEGER DEFAULT 0,
      schema_version TEXT DEFAULT '1.0',
      api_version TEXT DEFAULT 'v1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_keys (
      key_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_bindings (
      binding_id TEXT PRIMARY KEY,
      owner_ref TEXT NOT NULL,
      wallet_type TEXT NOT NULL,
      chain_type TEXT NOT NULL,
      address TEXT NOT NULL,
      signature TEXT NOT NULL DEFAULT '',
      nonce TEXT NOT NULL,
      nonce_expires_at TEXT,
      verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_bindings_owner
      ON wallet_bindings(owner_ref, verified, created_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_bindings_owner_chain_address
      ON wallet_bindings(owner_ref, chain_type, address);
  `);

  ensureColumn(db, "agents", "status", "TEXT DEFAULT 'active'");
  ensureColumn(db, "execution_records", "chain_type", "TEXT");
  ensureColumn(db, "execution_records", "chain_id", "TEXT");
  ensureColumn(db, "execution_records", "tx_hash", "TEXT");
  ensureColumn(db, "execution_records", "wallet_address", "TEXT");
  ensureColumn(db, "execution_records", "gas_used", "TEXT");
  ensureColumn(db, "execution_records", "block_number", "INTEGER");
  ensureColumn(db, "settlement_records", "chain_type", "TEXT");
  ensureColumn(db, "settlement_records", "chain_id", "TEXT");
  ensureColumn(db, "settlement_records", "tx_hash", "TEXT");
  ensureColumn(db, "settlement_records", "wallet_address", "TEXT");
  ensureColumn(db, "settlement_records", "gas_used", "TEXT");
  ensureColumn(db, "settlement_records", "block_number", "INTEGER");
  ensureColumn(db, "wallet_bindings", "nonce_expires_at", "TEXT");
  ensureVersionColumns(db, "agents");
  ensureVersionColumns(db, "capability_tokens");
  ensureVersionColumns(db, "policies");
  ensureVersionColumns(db, "permission_audits");
  ensureVersionColumns(db, "execution_records");
  ensureVersionColumns(db, "settlement_records");
  ensureVersionColumns(db, "reputation");
  ensureVersionColumns(db, "feedback_records");
}

function ensureVersionColumns(db: SqlDatabase, table: string): void {
  ensureColumn(db, table, "schema_version", "TEXT DEFAULT '1.0'");
  ensureColumn(db, table, "api_version", "TEXT DEFAULT 'v1'");
}

function ensureColumn(
  db: SqlDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}
