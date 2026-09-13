/*
 * PUBLIC MIRROR STUB — the schema is not open source.
 *
 * In the private repository this package is the whole Postgres schema: every
 * table, column and index across the broker and admin namespaces, plus the
 * migration history. Publishing it would hand anyone a map of the indexer's
 * storage, so what ships here is the export surface the interface refers to and
 * nothing behind it.
 *
 * Nothing in this repository reaches a database. The five modules that did are
 * stubbed alongside this package — see `lib/db.ts` and the files listed in
 * README.md — so these declarations exist to keep imports resolving, not to be
 * called.
 */

/** Opaque handle. The real one is a drizzle instance over a pg Pool. */
export type Db = never;

export function createDb(_url: string): { db: Db; pool: never } {
  throw new Error(
    "@iter/db is stubbed in the open-source interface. " +
      "Point the app at your own backend, or restore a real implementation.",
  );
}

/*
 * Table handles, declared as `never` so any accidental query fails to compile
 * rather than at runtime. A stub that returned a plausible object would let a
 * contributor write a query that typechecks here and cannot work anywhere.
 */
export const spotPairs = undefined as never;
export const spotTokens = undefined as never;
export const iterMetrics = undefined as never;
export const landingContent = undefined as never;
export const graduationConfig = undefined as never;
export const supportTickets = undefined as never;
export const supportMessages = undefined as never;
