import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { OpenOrder } from '@/data/samples';
import {
  TradingTableHeader,
  type SortDirection,
  type ColumnConfig,
} from '@/components/Molecules/TradingTableHeader';
import { TradingTableRow } from '@/components/Molecules/TradingTableRow';

type OpenOrdersTableProps = {
  orders: OpenOrder[];
  className?: string;
  onViewDetails?: (id: string) => void;
  onCancelOrder?: (id: string) => void;
};

// Column configuration for Open Orders - explicitly include the actions column
const OPEN_ORDERS_COLUMNS: ColumnConfig[] = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'pair', label: 'Pair', sortable: true },
  { key: 'price', label: 'Price', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'filled', label: 'Filled', sortable: true },
  { key: 'txHash', label: 'Tx Hash', sortable: true },
  { key: 'actions', label: '' }, // Explicit actions column
];

export function OpenOrdersTable({
  orders,
  className,
  onViewDetails,
  onCancelOrder,
}: OpenOrdersTableProps) {
  const [sortedOrders, setSortedOrders] = useState<OpenOrder[]>(orders);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedOrders, setSelectedOrders] = useState<Record<string, boolean>>(
    {},
  );
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    // Initialize selected orders
    const initialSelected = orders.reduce<Record<string, boolean>>(
      (acc, order) => {
        acc[order.id] = order.selected || false;
        return acc;
      },
      {},
    );
    setSelectedOrders(initialSelected);

    // Reset sorted orders when orders change
    setSortedOrders(orders);
  }, [orders]);

  const handleSort = (field: string) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = sortField !== field ? 'asc' : isAsc ? 'desc' : 'asc';

    setSortField(field);
    setSortDirection(newDirection);

    // Sort the orders based on field and direction
    const sortedResults = [...sortedOrders].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'pair':
          comparison = a.pair.localeCompare(b.pair);
          break;
        case 'price':
          // Extract numeric value from price string for comparison
          const priceA = parseFloat(a.price.replace(/[^\d.-]/g, ''));
          const priceB = parseFloat(b.price.replace(/[^\d.-]/g, ''));
          comparison = priceA - priceB;
          break;
        case 'amount':
          // Extract numeric value from amount string for comparison
          const amountA = parseFloat(a.amount.replace(/[^\d.-]/g, ''));
          const amountB = parseFloat(b.amount.replace(/[^\d.-]/g, ''));
          comparison = amountA - amountB;
          break;
        case 'filled':
          // Extract numeric value from filled string for comparison
          const filledA = parseFloat(a.filled.replace(/[^\d.-]/g, ''));
          const filledB = parseFloat(b.filled.replace(/[^\d.-]/g, ''));
          comparison = filledA - filledB;
          break;
        case 'txHash':
          comparison = a.txHash.localeCompare(b.txHash);
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setSortedOrders(sortedResults);
  };

  const handleSelectAll = (checked: boolean) => {
    setAllSelected(checked);
    const newSelectedOrders = sortedOrders.reduce<Record<string, boolean>>(
      (acc, order) => {
        acc[order.id] = checked;
        return acc;
      },
      {},
    );
    setSelectedOrders(newSelectedOrders);
  };

  const handleSelectOrder = (id: string, checked: boolean) => {
    setSelectedOrders(prev => ({
      ...prev,
      [id]: checked,
    }));

    // Check if all orders are now selected
    const updatedSelectedOrders = {
      ...selectedOrders,
      [id]: checked,
    };

    const allOrdersSelected = sortedOrders.every(
      order => updatedSelectedOrders[order.id],
    );
    setAllSelected(allOrdersSelected);
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
        columns={OPEN_ORDERS_COLUMNS}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        isSelectAllChecked={allSelected}
        onSelectAll={handleSelectAll}
      />

      {/* Table Rows */}
      <div className="mt-6 w-full">
        {sortedOrders.map(order => (
          <TradingTableRow
            key={order.id}
            id={order.id}
            cells={[
              { key: 'date', value: order.date },
              { key: 'pair', value: order.pair },
              { key: 'price', value: order.price },
              { key: 'amount', value: order.amount },
              { key: 'filled', value: order.filled },
              { key: 'txHash', value: order.txHash },
            ]}
            isSelected={selectedOrders[order.id] || false}
            onSelectChange={handleSelectOrder}
            actions={[
              {
                label: 'View Details',
                onClick: () => onViewDetails?.(order.id),
              },
              {
                label: 'Cancel Order',
                onClick: () => onCancelOrder?.(order.id),
              },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
