/**
 * The coin card's title and stat rows, shared by the `/create` preview and the
 * Launches grid.
 *
 * `TokenArt` made the two cards draw the same picture; these make them read as
 * the same card. The preview promises "This is the card Explore renders once it
 * deploys", so anything below the art that looks different on one surface is
 * the same broken promise in a smaller font.
 *
 * What they do NOT share is the data: supply and an opening rate before the
 * coin exists, market cap and listing progress after. That difference is the
 * point of the two screens.
 */
export function CardTitle({ symbol, name }: { symbol: string; name: string }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-1.5">
      <b className="text-[14.5px] font-bold">${symbol}</b>
      <span aria-hidden className="text-[12.5px] text-[var(--m-text-secondary-2)]">
        ·
      </span>
      <span className="truncate text-[12.5px] text-[var(--m-text-secondary)]">{name}</span>
    </div>
  );
}

/**
 * One label/value line. `children` renders instead of `v` when the value needs
 * its own colour or a second element — the change badge and the progress bar.
 */
export function CardRow({
  k,
  v,
  children,
}: {
  k: string;
  v?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--m-border)] py-1.5 last:border-b-0">
      <dt className="text-[var(--m-text-secondary-2)]">{k}</dt>
      <dd className="truncate text-right">{children ?? v}</dd>
    </div>
  );
}
