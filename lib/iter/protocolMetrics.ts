/*
 * PUBLIC MIRROR STUB — the real implementation is not open source.
 *
 * Aggregates protocol revenue from Postgres in the private repository.
 * `isFallback: true` is the real module's own signal that the figures are
 * illustrative rather than measured, and the flywheel component already renders
 * that state — so this mirror shows the same thing a database outage would.
 */
export interface PairRevenueSource {
  pair: string;
  weeklyRevenueUsd: number;
  sharePct: number;
}

export interface ProtocolFlywheelData {
  weeklyRevenueUsd: number;
  pairSources: PairRevenueSource[];
  feeRate: number;
  periodLabel: string;
  buybackBurnIter: number;
  buybackBurnUsd: number;
  backingPerIter: number;
  annualDeflationPct: number;
  isFallback: boolean;
}

export async function getProtocolFlywheelData(): Promise<ProtocolFlywheelData> {
  return {
    weeklyRevenueUsd: 0,
    pairSources: [],
    feeRate: 0,
    periodLabel: "",
    buybackBurnIter: 0,
    buybackBurnUsd: 0,
    backingPerIter: 0,
    annualDeflationPct: 0,
    isFallback: true,
  };
}
