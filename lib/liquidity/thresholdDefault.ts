/**
 * The listing threshold served when the operator's config row has never been written.
 *
 * Its own module because it is needed on both sides of the server boundary: the server
 * read (./threshold, which imports the db client and is `server-only`) and the client
 * components that draw progress toward it. Before this there were three copies of the
 * number — poolStats, ExploreShelves and the server read — and three copies of a threshold
 * is three chances for a progress bar to disagree with the sweep that acts on it.
 *
 * Mirrors admin-service's `DEFAULT_CONFIG.thresholdUsd`. Duplicated across the repo
 * boundary rather than imported, because apps/web does not depend on admin-service; the
 * config row is the single source of truth whenever one exists.
 */
export const DEFAULT_THRESHOLD_USD = 100_000;
