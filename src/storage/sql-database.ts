export type SqlValue = ArrayBuffer | string | number | null;

export interface SyncSqlDatabase {
  execute(query: string, ...bindings: SqlValue[]): void;
  query<T>(query: string, ...bindings: SqlValue[]): T[];
  transaction<T>(operation: () => T): T;
}
