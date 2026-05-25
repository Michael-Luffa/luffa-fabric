export class SqliteRepositoryNotImplemented extends Error {
  constructor() {
    super("SQLite repositories are intentionally left as an MVP1 extension point; use memory repositories for MVP1 demos and tests.");
    this.name = "SqliteRepositoryNotImplemented";
  }
}
