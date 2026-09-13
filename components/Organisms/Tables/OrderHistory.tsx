"use client";
import { useEffect, useMemo, useState } from "react";
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
import { exportToCSV, truncateTxHash } from "@/utils/order";
import { Button } from "@/components/ui/button";
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
import type { OrderHistoryRow } from "@/hooks/useOrderHistory";
import { ChevronDown, ChevronUp, SquareArrowOutUpRight } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "motion/react";

export function OrderHistory({}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { connectedNetworkName, address } = useMarketPageContext();
  const {
    orderHistories,
    orderHistoriesTotalPages,
    setOrderHistoriesPage,
    isOrderHistoriesLoading,
  } = useOrderPageContext();

  const [pagination, setPagination] = useState({
    pageIndex: 0, //initial page index
    pageSize: 10, //default page size
  });

  useEffect(() => {
    const { pageIndex } = pagination;
    // @ts-ignore
    setOrderHistoriesPage(pageIndex + 1);
  }, [pagination]);

  // Table columns
  const columns: ColumnDef<OrderHistoryRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => {
          <div className="w-[100px]"></div>;
        },
        cell: ({ row }) => {
          const rowKey = `${pagination.pageIndex}-${row.id}`;
          const isExpanded = expandedRows.has(rowKey);
          return (
            <motion.div
              className="w-4 h-4 text-gray-400 hover:text-primary-default transition-colors"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "timestamp",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1">Date</div>;
        },
        cell: ({ row }) => (
          <div className="lowercase w-full text-white">
            {new Date(
              (row.getValue("timestamp") as number) * 1000
            ).toLocaleDateString()}
          </div>
        ),
      },
      {
        accessorKey: "pairSymbol",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1">Pair</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-full text-white`}
          >
            {row.original.pairSymbol}
          </div>
        ),
      },
      {
        accessorKey: "assetSymbol",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1">Asset</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-full text-white`}
          >
            {row.original.assetSymbol}
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1">Price</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-full text-white`}
          >
            {row.getValue("price")}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => {
          return <div className="w-full text-dark-grey-1">Amount</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-full text-white`}
          >
            {Number.parseFloat(row.getValue("amount"))}{" "}
            {row.original.isBid
              ? row.original.quoteSymbol
              : row.original.baseSymbol}
          </div>
        ),
      },
    ],
    [connectedNetworkName, expandedRows]
  );

  const [data, setData] = useState(orderHistories);

  const table = useReactTable({
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: orderHistoriesTotalPages,
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
    setData(orderHistories);
  }, [orderHistories]);

  // Memoize Table
  const memoTable = () => (
    <Table>
      <TableHeader className="bg-white-8 rounded-[24px] border-b-[1px] border-white-12 h-[40px]">
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
      <TableBody className="w-full">
        {table.getRowModel().rows?.length || isOrderHistoriesLoading ? (
          <>
            {table.getRowModel().rows.map((row) => (
              <>
                <TableRow
                  key={`${pagination.pageIndex}-${row.id}`}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="w-full border-b-[1px] border-white-12 text-gray-400 hover:bg-neutral-dark-500 h-[40px] text-[12px]"
                  onClick={() => toggleRowExpansion(row.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
                <AnimatePresence>
                  {expandedRows.has(`${pagination.pageIndex}-${row.id}`) && (
                    <motion.tr
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ 
                        duration: 0.3, 
                        ease: "easeInOut",
                        opacity: { duration: 0.2 }
                      }}
                      className="w-full"
                    >
                      <TableCell colSpan={columns.length} className="p-0">
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2, delay: 0.1 }}
                          className="bg-neutral-dark-600 h-[calc(100%-40px)]"
                        >
                          <div className="pl-[30px]">
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0.3, delay: 0.2 }}
                              className="flex text-white h-[40px] items-center text-[12px]"
                            >
                              <div className="flex">
                                <div className="mr-[4px]">Order No:</div>
                                <div>{row.original.orderId}</div>
                              </div>
                              <div className="flex justify-center items-center cursor-pointer ml-[2px]">
                                <svg
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-[16px] w-[16px] text-gray-400"
                                >
                                  <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M9 3h11v13h-3V6H9V3zM4 8v13h11V8.02L4 8z"
                                    fill="currentColor"
                                  ></path>
                                </svg>
                              </div>
                              <div className="flex ml-[8px] pl-[8px] border-l border-gray-600">
                                <div className="mr-[4px]">Time Updated:</div>
                                <div>
                                  {new Date(
                                    (row.original.timestamp as number) * 1000
                                  ).toLocaleString()}
                                </div>
                              </div>
                              <div className="flex ml-[8px] pl-[8px] border-l border-gray-600">
                                <div className="mr-[4px]">
                                  Total Transaction Fee:
                                </div>
                                <div>
                                  <span>0.00000785 BNB &nbsp;</span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex justify-start ml-[8px] pl-[8px] border-l border-gray-600">
                                  <svg
                                    className="hover:text-primary-default cursor-pointer text-white h-[16px] w-[16px]"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      clipRule="evenodd"
                                      d="M21.002 17v-5a9.113 9.113 0 00-.055-1 9.001 9.001 0 00-17.945 1v5h5v-6H5.578a6.502 6.502 0 0112.848 0h-2.424v6h.899a6.988 6.988 0 01-3.289 1.814 2 2 0 10.217 2A9.007 9.007 0 0019.486 17h1.516z"
                                      fill="currentColor"
                                    ></path>
                                  </svg>
                                </div>
                              </div>
                            </motion.div>
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3, delay: 0.3 }}
                            >
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-none h-[32px]">
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Date
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Trading Price
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Executed
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Transaction Fee
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Total
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      Role
                                    </TableHead>
                                    <TableHead className="text-[12px] text-gray-400 font-normal">
                                      TX Hash
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.original.matchHistories?.map(
                                    (matchHistory, index) => (
                                      <motion.tr
                                        key={index}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ 
                                          duration: 0.2, 
                                          delay: 0.4 + (index * 0.05) 
                                        }}
                                        className="border-none h-[40px]"
                                      >
                                        <TableCell className="text-[12px] text-white">
                                          {new Date(
                                            (matchHistory.timestamp as number) *
                                              1000
                                          ).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white">
                                          {matchHistory.price}
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white">
                                          {matchHistory.amount}
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white">
                                          0.00000785 BNB
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white">
                                          {(
                                            Number(matchHistory.price) *
                                            Number(matchHistory.amount)
                                          ).toFixed(6)}{" "}
                                          USDT
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white">
                                          Taker
                                        </TableCell>
                                        <TableCell className="text-[12px] text-white font-mono flex items-center">
                                          {truncateTxHash(matchHistory.txHash)}
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <SquareArrowOutUpRight className="w-4 h-4 ml-2 hover:text-primary-default" />
                                            </TooltipTrigger>
                                            <TooltipContent className="bg-white text-black" side="bottom" sideOffset={8}>
                                              <p>View tx on explorer</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TableCell>
                                      </motion.tr>
                                    )
                                  )}
                                </TableBody>
                              </Table>
                            </motion.div>
                          </div>
                        </motion.div>
                      </TableCell>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            ))}
          </>
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
                type: row.original.isBid ? "Buy" : "Sell",
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
                timestamp: row.original.timestamp,
                txHash: row.original.txHash,
              };
            }),
            `order_history_${address}`
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

  const toggleRowExpansion = (rowId: string) => {
    const rowKey = `${pagination.pageIndex}-${rowId}`;
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(rowKey)) {
      newExpandedRows.delete(rowKey);
    } else {
      newExpandedRows.add(rowKey);
    }
    setExpandedRows(newExpandedRows);
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
            Page {pagination.pageIndex + 1} of {orderHistoriesTotalPages}
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

export default OrderHistory;
