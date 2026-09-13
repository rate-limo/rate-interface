'use client';

import { useState, useEffect } from 'react';
import {
  TokenTableHeader,
  type SortDirection,
  type SortField,
} from '@/components/Molecules/TokenTableHeader';
import { TokenTableRow } from '@/components/Molecules/TokenTableRow';
import { cn } from '@/lib/utils';
import { SpotToken } from '@/types';
import numeral from "numeral"
import { formatMarketCap } from "@/utils/number"

export type TokenTableData = {
  id: string;
  name: string;
  symbol: string;
  iconColor: string;
  price: number;
  marketCap: string;
  volume: string;
  percentageChange: number;
  chartData: number[];
  isFavorite: boolean;
};

export type ColumnVisibility = {
  name: boolean;
  price: boolean;
  marketCap: boolean;
  volume: boolean;
  change: boolean;
  chart: boolean;
};

type TokenTableProps = {
  data: SpotToken[];
  className?: string;
  onToggleFavorite?: (id: string) => void;
  compact?: boolean;
  columns?: ColumnVisibility;
};

// Default column visibility (all columns shown)
const DEFAULT_COLUMNS: ColumnVisibility = {
  name: true,
  price: true,
  marketCap: true,
  volume: true,
  change: true,
  chart: true,
};

// Compact mode column visibility (name, price, change only)
const COMPACT_COLUMNS: ColumnVisibility = {
  name: true,
  price: true,
  marketCap: false,
  volume: false,
  change: true,
  chart: false,
};

export function TokenTable({
  data,
  className,
  onToggleFavorite,
  compact = false,
  columns,
}: TokenTableProps) {
  const [tokens, setTokens] = useState<SpotToken[]>(data ?? []);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Determine which columns to display
  const visibleColumns =
    columns || (compact ? COMPACT_COLUMNS : DEFAULT_COLUMNS);

  useEffect(() => {
    if (data !== undefined) {
      setTokens(data);
    }
  }, [data]);

  const handleSort = (field: SortField) => {
    // Don't allow sorting on columns that aren't visible
    if (!field || !visibleColumns[field as keyof ColumnVisibility]) {
      return;
    }

    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = sortField !== field ? 'asc' : isAsc ? 'desc' : 'asc';

    setSortField(field);
    setSortDirection(newDirection);

    const sortedTokens = [...tokens].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'price':
          comparison = a.priceUSD - b.priceUSD;
          break;
        case 'marketCap':
          // Sort on the indexed column, not a recomputed product. Unpriced
          // tokens (null) and pre-migration indexers (undefined) sort as 0,
          // which keeps them together at one end rather than interleaving.
          comparison = (a.marketCap ?? 0) - (b.marketCap ?? 0);
          break;
        case 'volume':
          comparison = a.dayVolumeUSD - b.dayVolumeUSD;
          break;
        case 'change':
          comparison = a.dayPriceDifferencePercentage - b.dayPriceDifferencePercentage;
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setTokens(sortedTokens);
  };

  /*
  const handleToggleFavorite = (id: string) => {
    if (onToggleFavorite) {
      onToggleFavorite(id);
    } else {
      setTokens(
        tokens.map(token =>
          token.id === id ? { ...token, isFavorite: !token.isFavorite } : token,
        ),
      );
    }
  };
  */

  return (
    <div
      className={cn(
        'border-neutral-light-white-12 w-full overflow-hidden rounded-[16px] border',
        className,
        compact ? "" : "px-4"
      )}
    >
      <TokenTableHeader
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        columns={visibleColumns}
        className={cn("w-full", compact ? "px-1 py-0" : "")}
      />
      <div
        className={cn("w-full pb-4", compact ? "" : "")}
      >
        {tokens.map(token => (
          <TokenTableRow
            key={token.id}
            id={token.id}
            name={token.name}
            symbol={token.symbol}
            logoURI={token.logoURI}
            iconColor={""}
            price={token.priceUSD}
            marketCap={formatMarketCap(token.marketCap)}
            volume={numeral(token.dayVolumeUSD).format('$0.0a')}
            percentageChange={token.dayPriceDifferencePercentage}
            chartData={token.sparkline7D}
            columns={visibleColumns}
            className={cn("w-full", compact ? "bg-neutral-dark-700 hover:bg-neutral-dark-600" : "hover:bg-neutral-dark-600")}
          />
        ))}
      </div>
    </div>
  );
}
