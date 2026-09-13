'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { type ColumnVisibility } from '@/components/Organisms/TokenTable';
import { TokenTableRow } from '@/components/Molecules/TokenTableRow';
import {
  TokenTableHeader,
  type SortDirection,
  type SortField,
} from '@/components/Molecules/TokenTableHeader';

type BalancesTableProps = {
  tokens: any[];
  className?: string;
  onToggleFavorite?: (id: string) => void;
};

const DEFAULT_COLUMNS: ColumnVisibility = {
  name: true,
  price: true,
  marketCap: true,
  volume: true,
  change: true,
  chart: true,
};

export function BalancesTable({
  tokens,
  className,
  onToggleFavorite,
}: BalancesTableProps) {
  const [tokenData, setTokenData] = useState<any[]>(tokens);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const columns = DEFAULT_COLUMNS;

  const handleSort = (field: SortField) => {
    if (!field || !columns[field as keyof ColumnVisibility]) {
      return;
    }

    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = sortField !== field ? 'asc' : isAsc ? 'desc' : 'asc';

    setSortField(field);
    setSortDirection(newDirection);

    const sortedTokens = [...tokenData].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'marketCap':
          comparison = a.marketCap.localeCompare(b.marketCap);
          break;
        case 'volume':
          comparison = a.volume.localeCompare(b.volume);
          break;
        case 'change':
          comparison = a.percentageChange - b.percentageChange;
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setTokenData(sortedTokens);
  };

  const handleToggleFavorite = (id: string) => {
    if (onToggleFavorite) {
      onToggleFavorite(id);
    } else {
      setTokenData(
        tokenData.map(token =>
          token.id === id ? { ...token, isFavorite: !token.isFavorite } : token,
        ),
      );
    }
  };

  return (
    <div
      className={cn(
        'border-neutral-light-white-12 bg-neutral-dark-default w-full overflow-hidden rounded-t-[16px] border-t border-r border-l px-4 py-2 text-xs',
        className,
      )}
    >
      {/* Use TokenTableHeader with trading variant */}
      <TokenTableHeader
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        columns={columns}
        variant="trading"
      />

      {/* Token Rows */}
      <div className="w-full">
        {tokenData.map(token => (
          <TokenTableRow
            key={token.id}
            id={token.id}
            name={token.name}
            symbol={token.symbol}
            logoURI={token.logoURI}
            iconColor={token.iconColor}
            price={token.price}
            marketCap={token.marketCap}
            volume={token.volume}
            percentageChange={token.percentageChange}
            chartData={token.chartData}
            isFavorite={token.isFavorite}
            onToggleFavorite={handleToggleFavorite}
            columns={columns}
            variant="trading"
          />
        ))}
      </div>
    </div>
  );
}
