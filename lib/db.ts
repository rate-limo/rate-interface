/*
 * PUBLIC MIRROR STUB — the real implementation is not open source.
 *
 * The private repository opens a Postgres pool here against the indexer's
 * database. Nothing in the interface needs it directly: every module that used
 * it is stubbed alongside this one.
 */
export const db = null as never;
