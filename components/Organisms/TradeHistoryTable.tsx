import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { TradeHistoryItem } from '@/data/samples';
import {
  TradingTableHeader,
  type SortDirection,
  type ColumnConfig,
} from '@/components/Molecules/TradingTableHeader';
import { TradingTableRow } from '@/components/Molecules/TradingTableRow';

type TradeHistoryTableProps = {
  trades: TradeHistoryItem[];
  className?: string;
  onViewDetails?: (id: string) => void;
};

// Column configuration for Trade History - explicitly include the actions column
const TRADE_HISTORY_COLUMNS: ColumnConfig[] = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'pair', label: 'Pair', sortable: true },
  { key: 'price', label: 'Price', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'received', label: 'Received', sortable: true },
  { key: 'tradedAt', label: 'Traded At', sortable: true },
  { key: 'txHash', label: 'Tx Hash', sortable: true },
  { key: 'actions', label: '' }, // Explicit actions column
];

export function TradeHistoryTable({
  trades,
  className,
  onViewDetails,
}: TradeHistoryTableProps) {
  const [sortedTrades, setSortedTrades] = useState<TradeHistoryItem[]>(trades);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedTrades, setSelectedTrades] = useState<Record<string, boolean>>(
    {},
  );
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    // Initialize selected trades
    const initialSelected = trades.reduce<Record<string, boolean>>(
      (acc, trade) => {
        acc[trade.id] = trade.selected || false;
        return acc;
      },
      {},
    );
    setSelectedTrades(initialSelected);

    // Reset sorted trades when trades change
    setSortedTrades(trades);
  }, [trades]);

  const handleSort = (field: string) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = sortField !== field ? 'asc' : isAsc ? 'desc' : 'asc';

    setSortField(field);
    setSortDirection(newDirection);

    // Sort the trades based on field and direction
    const sortedResults = [...sortedTrades].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'pair':
          comparison = a.pair.localeCompare(b.pair);
          break;
        case 'price':
          comparison = a.price.localeCompare(b.price);
          break;
        case 'amount':
          comparison = a.amount.localeCompare(b.amount);
          break;
        case 'received':
          comparison = a.received.localeCompare(b.received);
          break;
        case 'tradedAt':
          comparison = a.tradedAt.localeCompare(b.tradedAt);
          break;
        case 'txHash':
          comparison = a.txHash.localeCompare(b.txHash);
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setSortedTrades(sortedResults);
  };

  const handleSelectAll = (checked: boolean) => {
    setAllSelected(checked);
    const newSelectedTrades = sortedTrades.reduce<Record<string, boolean>>(
      (acc, trade) => {
        acc[trade.id] = checked;
        return acc;
      },
      {},
    );
    setSelectedTrades(newSelectedTrades);
  };

  const handleSelectTrade = (id: string, checked: boolean) => {
    setSelectedTrades(prev => ({
      ...prev,
      [id]: checked,
    }));

    // Check if all trades are now selected
    const updatedSelectedTrades = {
      ...selectedTrades,
      [id]: checked,
    };

    const allTradesSelected = sortedTrades.every(
      trade => updatedSelectedTrades[trade.id],
    );
    setAllSelected(allTradesSelected);
  };

  return (
    <div
      className={cn(
        'border-neutral-light-white-12 bg-neutral-dark-default w-full overflow-hidden rounded-t-[16px] border-t border-r border-l px-4 pt-4',
        className,
      )}
    >
      {/* Use the TradingTableHeader component */}
      <TradingTableHeader
        columns={TRADE_HISTORY_COLUMNS}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        isSelectAllChecked={allSelected}
        onSelectAll={handleSelectAll}
      />

      {/* Table Rows */}
      <div className="mt-6 w-full">
        {sortedTrades.map(trade => (
          <TradingTableRow
            key={trade.id}
            id={trade.id}
            cells={[
              { key: 'date', value: trade.date },
              { key: 'pair', value: trade.pair },
              { key: 'price', value: trade.price },
              { key: 'amount', value: trade.amount },
              { key: 'received', value: trade.received },
              { key: 'tradedAt', value: trade.tradedAt },
              { key: 'txHash', value: trade.txHash },
            ]}
            isSelected={selectedTrades[trade.id] || false}
            onSelectChange={handleSelectTrade}
            actions={[
              {
                label: 'View Details',
                onClick: () => onViewDetails?.(trade.id),
              },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
