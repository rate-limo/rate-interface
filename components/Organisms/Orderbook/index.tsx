import Orderbooks from "./Orderbooks";

export default function OrderBook() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--m-background)] text-[12px] text-[color:var(--m-text-primary)]">
      <div className="flex h-10 shrink-0 items-center border-b border-[color:var(--m-border)] px-3">
        <span className="font-medium text-[color:var(--m-text-primary)]">Order book</span>
      </div>
      <Orderbooks />
    </div>
  );
}
