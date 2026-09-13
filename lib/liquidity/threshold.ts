/*
 * PUBLIC MIRROR STUB — the real implementation is not open source.
 *
 * Reads the operator's graduation threshold from Postgres in the private
 * repository. The default below is the same constant the real module falls back
 * to when the config row has never been written.
 */
const DEFAULT_THRESHOLD_USD = 100_000;

export { DEFAULT_THRESHOLD_USD };

export async function readGraduationThreshold(): Promise<number> {
  return DEFAULT_THRESHOLD_USD;
}
