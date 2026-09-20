import type { SqlValue, SyncSqlDatabase } from "./sql-database";

export class CloudflareSqlDatabase implements SyncSqlDatabase {
  constructor(private readonly storage: DurableObjectStorage) {}

  execute(query: string, ...bindings: SqlValue[]): void {
    this.storage.sql.exec(query, ...bindings).toArray();
  }

  query<T>(query: string, ...bindings: SqlValue[]): T[] {
    return this.storage.sql.exec(query, ...bindings).toArray() as T[];
  }

  transaction<T>(operation: () => T): T {
    return this.storage.transactionSync(operation);
  }
}
