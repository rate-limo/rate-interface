'use client';

import { useState, useEffect } from 'react';
import {
  SpotPairTableHeader,
  type SortDirection,
  type SortField,
} from '@/components/Molecules/SpotPairTableHeader';
import { SpotPairTableRow } from '@/components/Molecules/SpotPairTableRow';
import { cn } from '@/lib/utils';
import { SpotPair } from '@/types';
import numeral from "numeral"

export type SpotPairTableData = {
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

type SpotPairTableProps = {
  data: SpotPair[];
  className?: string;
  onToggleFavorite?: (id: string) => void;
  compact?: boolean;
  columns?: ColumnVisibility;
};

// Default column visibility (all columns shown)
const DEFAULT_COLUMNS: ColumnVisibility = {
  name: true,
  price: true,
  marketCap: false,
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

export function SpotPairTable({
  data,
  className,
  onToggleFavorite,
  compact = false,
  columns,
}: SpotPairTableProps) {
  const [pairs, setPairs] = useState<SpotPair[]>(data ?? []);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Determine which columns to display
  const visibleColumns =
    columns || (compact ? COMPACT_COLUMNS : DEFAULT_COLUMNS);

  useEffect(() => {
    if (data !== undefined) {
      setPairs(data);
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

    const sortedPairs = [...pairs].sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'name':
          comparison = a.symbol.localeCompare(b.symbol);
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'volume':
          comparison = a.dayBaseVolumeUSD - b.dayBaseVolumeUSD;
          break;
        case 'change':
          comparison = a.dayPriceDifferencePercentage - b.dayPriceDifferencePercentage;
          break;
        case 'marketCap':
          comparison = a.dayBaseTvlUSD - b.dayBaseTvlUSD;
          break;
        default:
          return 0;
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setPairs(sortedPairs);
  };

  const handleToggleFavorite = (id: string) => {
    if (onToggleFavorite) {
      onToggleFavorite(id);
    } else {
      setPairs(
        pairs.map(pair =>
          pair.id === id ? { ...pair, isFavorite: !pair.isFavorite } : pair,
        ),
      );
    }
  };

  return (
    <div
      className={cn(
        'border-neutral-light-white-12 w-full overflow-hidden rounded-[16px] border',
        className,
        compact ? "" : "px-4"
      )}
    >
      <SpotPairTableHeader
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        columns={visibleColumns}
        className={cn("w-full", compact ? "px-1 py-0" : "")}
      />
      <div
        className={cn("w-full pb-4", compact ? "" : "")}
      >
        {pairs.map(pair => (
          <SpotPairTableRow
            key={pair.id}
            id={pair.id}
            name={pair.symbol}
            symbol={pair.symbol}
            logoURI={pair.base.logoURI}
            iconColor={""}
            price={pair.price}
            marketCap={numeral(pair.dayBaseTvlUSD).format('$0.0a')}
            volume={numeral(pair.dayQuoteVolumeUSD * 2).format('$0.0a')}
            percentageChange={pair.dayPriceDifferencePercentage}
            chartData={pair.sparkline7D}
            isFavorite={pair.isFavorite}
            onToggleFavorite={handleToggleFavorite}
            columns={visibleColumns}
            className={cn("w-full", compact ? "bg-neutral-dark-700 hover:bg-neutral-dark-600" : "hover:bg-neutral-dark-600")}
          />
        ))}
      </div>
    </div>
  );
}
