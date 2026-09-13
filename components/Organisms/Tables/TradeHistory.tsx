"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { exportToCSV } from "@/utils/order";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { SpotTradeEvent } from "@/types";
import { viewerBought, viewerRole, viewerSide } from "@/lib/trades/perspective";
import { ChevronRight } from "lucide-react";

export function TradeHistory({}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const { connectedNetworkName, address } = useMarketPageContext();
  const {
    tradeHistories,
    tradeHistoriesTotalPages,
    setTradeHistoriesPage,
    isTradeHistoriesLoading,
  } = useOrderPageContext();

  const [pagination, setPagination] = useState({
    pageIndex: 0, //initial page index
    pageSize: 10, //default page size
  });

  useEffect(() => {
    const { pageIndex } = pagination;
    setTradeHistoriesPage(pageIndex + 1);
  }, [pagination]);

  // Table columns
  const columns: ColumnDef<SpotTradeEvent>[] = useMemo(
    () => [
      {
        accessorKey: "orderId",
        header: ({ column }) => {
          return <div className="w-1/6 ml-4 text-dark-grey-1">Order ID</div>;
        },
        cell: ({ row }) => (
          <div className="lowercase w-1/6 ml-4 text-white">
            {viewerSide(row.original.isBid, row.original.taker, address)}-
            {row.getValue("orderId")}
          </div>
        ),
      },
      {
        accessorKey: "timestamp",
        header: ({ column }) => {
          return (
            <div className="max-w-[100px] ml-4 text-dark-grey-1 w-[11.111111%]">
              Date
            </div>
          );
        },
        cell: ({ row }) => {
          const date = new Date((row.getValue("timestamp") as number) * 1000);
          const month = (date.getMonth() + 1).toString().padStart(2, "0");
          const day = date.getDate().toString().padStart(2, "0");
          const hours = date.getHours().toString().padStart(2, "0");
          const minutes = date.getMinutes().toString().padStart(2, "0");
          const seconds = date.getSeconds().toString().padStart(2, "0");
          const formattedDate = `${month}-${day} ${hours}:${minutes}:${seconds}`;

          return (
            <div className="lowercase w-[100px] text-white ml-4">
              {formattedDate}
            </div>
          );
        },
      },
      {
        accessorKey: "pairSymbol",
        header: ({ column }) => {
          return <div className="w-[100px] ml-4 text-dark-grey-1">Pair</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-[100px] text-white ml-4 group-hover:text-primary-default transition cursor-pointer flex items-center`}
          >
            {row.original.pairSymbol}
            <ChevronRight className="opacity-0 group-hover:opacity-100 transition-opacity w-3 h-3" />
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1 ml-2">Type</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-full text-white ml-2`}>limit</div>
        ),
      },
      {
        accessorKey: "side",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1 ml-2">Side</div>;
        },
        // Side is the VIEWER's, not the taker's. `isBid` is the direction of the
        // order that crossed the book, so a maker whose resting sell was hit by a
        // buy has sold — see lib/trades/perspective. The endpoint behind this
        // table returns both sides of a fill since the taker/maker OR landed in
        // apps/gateway/src/api/orders.ts; before that this branch was unreachable
        // and reading `isBid` raw happened to be right.
        cell: ({ row }) => {
          const bought = viewerBought(row.original.isBid, row.original.taker, address);
          return (
            <div
              className={`capitalize w-full ml-2 ${
                bought ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300"
              }`}
            >
              {bought ? "Buy" : "Sell"}
            </div>
          );
        },
      },
      {
        accessorKey: "price",
        header: ({ column }) => {
          return <div className="w-full ml-4 text-dark-grey-1">Price</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-full text-white`}>
            {row.getValue("price")}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => {
          return <div className="w-1/6 ml-4 text-dark-grey-1">Executed</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-1/6 w-[100px] text-white`}>
            {Number.parseFloat(row.getValue("amount")).toFixed(4)}{" "}
            {row.original.assetSymbol}
          </div>
        ),
      },
      {
        accessorKey: "fee",
        header: ({ column }) => {
          return <div className="w-1/6 ml-4 text-dark-grey-1">Fee</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-1/6 w-[100px] text-white`}>
            {(Number.parseFloat(row.getValue("amount")) * 0.001).toFixed(4)}{" "}
            {row.original.assetSymbol}
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: ({ column }) => {
          return (
            <div className="w-full text-dark-grey-1 text-center flex items-center justify-center">
              Role
            </div>
          );
        },
        // Compared against the wallet being viewed, never against `account`:
        // the gateway resynthesizes `account` FROM `taker`, so that test was
        // true on every row this table has ever rendered and the column said
        // "Taker" unconditionally.
        cell: ({ row }) => (
          <div
            className={`capitalize w-full w-[100px] text-white text-center`}
          >
            {viewerRole(row.original.taker, address)}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => {
          return <div className="w-1/6 ml-4 text-dark-grey-1">Total</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-1/6 text-white`}>
            {Number.parseFloat(row.getValue("amount")).toFixed(4)}{" "}
            {row.original.quoteSymbol}
          </div>
        ),
      },
      {
        accessorKey: "valueUSD",
        header: ({ column }) => {
          return (
            <div className="w-1/6 ml-4 text-dark-grey-1 mr-4">Total in USD</div>
          );
        },
        cell: ({ row }) => (
          <div className={`capitalize w-1/6 text-white`}>
            ≈ {Number.parseFloat(row.getValue("valueUSD")).toFixed(4)} USD
          </div>
        ),
      },
    ],
    // `address` is read by the Side and Role cells, so a wallet switch has to
    // rebuild them — stale cells would report the previous wallet's side.
    [connectedNetworkName, address]
  );

  const [data, setData] = useState(tradeHistories);

  const table = useReactTable({
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: tradeHistoriesTotalPages,
    onSortingChange: (updater) => {
      if (typeof updater === "function") {
        setSorting(updater);
      } else {
        setSorting(updater);
      }
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // @ts-ignore
    onPaginationChange: setPagination,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
  });

  useEffect(() => {
    setData(tradeHistories);
  }, [tradeHistories]);

  // Memoize Table
  const memoTable = () => (
    <Table>
      <TableHeader className="bg-white-8 rounded-[24px] border-b-[1px] border-white-12 h-[40px] text-[12px]">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow
            key={headerGroup.id}
            className="border-b-[1px] border-white-12 h-[40px] text-[12px]"
          >
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows?.length || isTradeHistoriesLoading ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="group border-b-[1px] border-white-12 text-gray-400 hover:bg-neutral-dark-500 text-[12px] h-[40px] transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              Loading...
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  const renderDownloadButton = () => {
    return (
      <button
        type="button"
        disabled={table.getFilteredSelectedRowModel().rows.length === 0}
        onClick={() => {
          exportToCSV(
            table.getFilteredSelectedRowModel().rows.map((row) => {
              return {
                date: new Date(
                  (row.original.timestamp as number) * 1000
                ).toLocaleDateString(),
                // The viewer's side, matching the Side column — an export that
                // disagrees with the table it came from is worse than either.
                type: viewerSide(row.original.isBid, row.original.taker, address),
                role: viewerRole(row.original.taker, address),
                orderId: row.original.orderId,
                base: row.original.base,
                quote: row.original.quote,
                baseSymbol: row.original.baseSymbol,
                quoteSymbol: row.original.quoteSymbol,
                pair: row.original.pair,
                pairSymbol: row.original.pairSymbol,
                price: row.original.price,
                account: row.original.account,
                asset: row.original.asset,
                assetSymbol: row.original.assetSymbol,
                amount: row.original.amount,
                valueUSD: row.original.valueUSD,
                baseAmount: row.original.baseAmount,
                quoteAmount: row.original.quoteAmount,
                timestamp: row.original.timestamp,
                taker: row.original.taker,
                maker: row.original.maker,
                txHash: row.original.txHash,
              };
            }),
            `trade_history_${address}`
          );
        }}
        className={`${
          table.getFilteredSelectedRowModel().rows.length > 0
            ? "border-primary-default"
            : "border-white-12"
        } ml-auto py-2 px-4 bg-neural-dark-600 border-[1px] rounded-[104px] hover:bg-neutral-dark-500 cursor-pointer`}
      >
        Export as CSV
      </button>
    );
  };

  return (
    <>
      {/* Cancel Order Table */}
      <div className="w-full">
        <div className="flex justify-start items-center py-4 border-white-12">
          <Input
            placeholder="Filter orders by pair"
            value={
              (table.getColumn("pairSymbol")?.getFilterValue() as string) ?? ""
            }
            onChange={(event) =>
              table.getColumn("pairSymbol")?.setFilterValue(event.target.value)
            }
            className="w-1/3 border-white-12 hover:bg-neutral-dark-500"
          />
          <div className="flex justify-center items-center py-4 border-white-12 w-1/3">
            Page {pagination.pageIndex + 1} of {tradeHistoriesTotalPages}
          </div>
        </div>
        <div className="rounded-[24px] border-[1px] border-white-12">
          {memoTable()}
        </div>
        <div className="flex items-center justify-center space-x-2 py-4">
          <div className="space-x-2">
            <Button
              className="bg-white-4 border-[1px] border-white-12 text-white hover:bg-neutral-dark-500 hover:text-white bg-neutral-dark-600"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              className="bg-white-4 border-[1px] border-white-12 text-white hover:bg-neutral-dark-500 hover:text-white bg-neutral-dark-600"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export default TradeHistory;
