/*
 * PUBLIC MIRROR STUB — the real implementation is not open source.
 *
 * Reads the operator's row copy from Postgres in the private repository.
 * Returning null is a REAL state there, not an invention for this mirror: the
 * function swallows its own database errors so the site serves built-in copy
 * rather than failing, and every caller already handles it.
 */
export interface RowContent {
  noticeEnabled: boolean;
  noticeText: string;
  noticeDetail: string;
  noticeCtaLabel: string;
  noticeHref: string;
  marketTapeEnabled: boolean;
  marketTapeLabel: string;
}

export async function getRowContent(): Promise<RowContent | null> {
  return null;
}
