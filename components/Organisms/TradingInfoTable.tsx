'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  TradingInfoTableHeader,
  type SortDirection,
  type SortField,
} from '@/components/Molecules/TradingInfoTableHeader';
import { TradingInfoTableRow } from '@/components/Molecules/TradingInfoTableRow';
import { type Transaction } from '@/data/samples';
import { WithdrawalDetailsModal } from './WithdrawDetailsModal';

type TradingInfoTableProps = {
  transactions: Transaction[];
  className?: string;
  onViewDetails: (id: string) => void;
};

export function TradingInfoTable({
  transactions,
  className,
  onViewDetails,
}: TradingInfoTableProps) {
  const [sortedTransactions, setSortedTransactions] =
    useState<Transaction[]>(transactions);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | undefined>()

  useEffect(() => {
    setSortedTransactions(transactions);
  }, [transactions]);

  const handleSort = (field: SortField) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = sortField !== field ? 'asc' : isAsc ? 'desc' : 'asc';

    setSortField(field);
    setSortDirection(newDirection);

    const sortedResults = [...sortedTransactions].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'amount':
          const amountA = parseFloat(a.amount.replace(/[^\d.-]/g, ''));
          const amountB = parseFloat(b.amount.replace(/[^\d.-]/g, ''));
          comparison = amountA - amountB;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setSortedTransactions(sortedResults);
  };

  return (
    <div
      className={cn(
        'border-neutral-light-white-12 bg-neutral-dark-default flex w-full flex-col rounded-t-[16px] border-t border-r border-l px-4 pt-4',
        className,
      )}
    >
      <TradingInfoTableHeader
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
      <div className="w-full">
        {sortedTransactions.map(transaction => (
          <TradingInfoTableRow
            key={transaction.id}
            type={transaction.type}
            amount={transaction.amount}
            status={transaction.status}
            date={transaction.date}
            onViewDetails={() => {
              setIsModalOpen(true)
              setSelectedTransaction(transaction);
              return onViewDetails(transaction.id)
            }}
          />
        ))}
      </div>
      <WithdrawalDetailsModal type={selectedTransaction && selectedTransaction?.type} withdrawalStatus={selectedTransaction?.status} address='X46D.......A4FG' estimatedTime={4} date={new Date()} amount={200} open={isModalOpen} onOpenChange={setIsModalOpen} />
    </div>
  );
}
