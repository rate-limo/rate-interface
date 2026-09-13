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
import { exchangeAbi } from "@/components/abis/exchange";
import { fillProgress, formatFillProgress } from "@/lib/orders/fillProgress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight, Trash2, PencilLine, Loader2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrderPageContext } from "@/contexts/OrderPageProvider";
import { useCancelOrders } from "@/hooks/useCancelOrders";
import { useMarketPageContext } from "@/contexts/MarketPageProvider";
import { SpotOrderEvent } from "@/types";
import { adjustDecimalLength } from "@/utils/number";
import { useConfig } from "wagmi";
import { writeContract } from "wagmi/actions";

export function OpenOrders({}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const { connectedNetworkName, matchingEngine } = useMarketPageContext();
  const {
    orders,
    ordersTotalCount,
    ordersTotalPages,
    setOrdersPage,
    isOrdersLoading,
  } = useOrderPageContext();

  const [pagination, setPagination] = useState({
    pageIndex: 0, //initial page index
    pageSize: 10, //default page size
  });

  const config = useConfig();

  useEffect(() => {
    const { pageIndex } = pagination;
    // @ts-ignore
    setOrdersPage(pageIndex + 1);
  }, [pagination]);

  // Table columns
  const columns: ColumnDef<SpotOrderEvent>[] = useMemo(
    () => [
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
          return <div className="w-[100px] text-dark-grey-1">Type</div>;
        },
        cell: ({ row }) => (
          <div className={`capitalize w-[100px] text-white ml-2`}>
            limit
          </div>
        ),
      },
      {
        accessorKey: "side",
        header: ({ column }) => {
          return <div className="w-[100px] text-dark-grey-1">Side</div>;
        },
        cell: ({ row }) => (
          <div
            className={`capitalize w-[100px] ml-2 ${
              row.original.isBid ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300"
            }`}
          >
            {row.original.isBid ? "Buy" : "Sell"}
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => {
          return <div className="w-[100px] ml-4 text-dark-grey-1">Price</div>;
        },
        cell: ({ row }) => {
          const [open, setOpen] = useState(false);
          return (
            <div
              className={`capitalize w-[100px] text-white ml-4 flex flex-row items-center`}
            >
              {adjustDecimalLength(Number.parseFloat(row.getValue("price")), 6)}
              <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                  <PencilLine className="w-3 h-3 ml-1 cursor-pointer" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  sideOffset={8}
                  className="bg-neutral-dark-600 w-[360px] p-[16px] rounded-[8px] border border-gray-600 shadow-lg"
                >
                  <div>
                    <div className="text-white font-medium text-[14px] mb-4">
                      Adjust Order
                    </div>
                    <DropdownMenuSeparator />
                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <label className="text-white font-medium text-[14px] min-w-[60px]">
                          Price
                        </label>
                        <div className="relative flex-1">
                          <input
                            lang="en"
                            id="FormRow-BUY-price"
                            name="price"
                            min="0.01"
                            type="number"
                            className="w-full bg-transparent border border-gray-600 rounded px-3 py-2 text-white pr-16 text-[14px] text-right"
                            spellCheck="false"
                            autoComplete=""
                            defaultValue={Number.parseFloat(row.getValue("price"))}
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-[14px]">
                            USDT
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <label className="text-white font-medium text-[14px] min-w-[60px]">
                          Amount
                        </label>
                        <div className="relative flex-1">
                          <input
                            lang="en"
                            id="FormRow-BUY-origQty"
                            name="origQty"
                            min="0.00100000"
                            type="number"
                            className="w-full bg-transparent border border-gray-600 rounded px-3 py-2 text-white pr-16 text-[14px] text-right"
                            spellCheck="false"
                            autoComplete=""
                            defaultValue={Number.parseFloat(
                              row.getValue("amount")
                            )}
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-[14px]">
                            {row.original.isBid
                              ? row.original.baseSymbol
                              : row.original.quoteSymbol}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setOpen(false);
                        }}
                        type="button"
                        className="flex-1 text-white border border-gray-600 rounded px-4 py-2 hover:bg-gray-700 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        className="flex-1 bg-primary-default text-on-primary rounded px-4 py-2 hover:bg-primary-500 transition-colors cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: ({ column }) => {
          return <div className="w-[100px] ml-4 text-dark-grey-1">Amount</div>;
        },
        cell: ({ row }) => {
          const [open, setOpen] = useState(false);
          return (
            <div
              className={`capitalize w-[100px] text-white ml-4 flex flex-row items-center`}
            >
              {adjustDecimalLength(
                Number.parseFloat(row.getValue("amount")),
                6
              )}{" "}
              <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                  <PencilLine className="w-3 h-3 ml-1 cursor-pointer" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  sideOffset={8}
                  className="bg-neutral-dark-600 w-[360px] p-4 rounded-[8px] border border-gray-600 shadow-lg"
                >
                  <div>
                    <div className="text-white font-medium text-[14px] mb-4">
                      Adjust Order
                    </div>
                    <DropdownMenuSeparator />
                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <label className="text-white font-medium text-[14px] min-w-[60px]">
                          Price
                        </label>
                        <div className="relative flex-1">
                          <input
                            lang="en"
                            id="FormRow-BUY-price"
                            name="price"
                            min="0.01"
                            type="number"
                            className="w-full bg-transparent border border-gray-600 rounded px-3 py-2 text-white pr-16 text-[14px] text-right"
                            spellCheck="false"
                            autoComplete=""
                            defaultValue={Number.parseFloat(row.getValue("price"))}
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-[14px]">
                            USDT
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <label className="text-white font-medium text-[14px] min-w-[60px]">
                          Amount
                        </label>
                        <div className="relative flex-1">
                          <input
                            lang="en"
                            id="FormRow-BUY-origQty"
                            name="origQty"
                            min="0.00100000"
                            type="number"
                            className="w-full bg-transparent border border-gray-600 rounded px-3 py-2 text-white pr-16 text-[14px] text-right"
                            spellCheck="false"
                            autoComplete=""
                            defaultValue={Number.parseFloat(
                              row.getValue("amount")
                            )}
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-[14px]">
                            {row.original.isBid
                              ? row.original.baseSymbol
                              : row.original.quoteSymbol}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setOpen(false);
                        }}
                        type="button"
                        className="flex-1 text-white border border-gray-600 rounded px-4 py-2 hover:bg-gray-700 transition-colors text-[14px] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        className="flex-1 bg-primary-default text-on-primary rounded px-4 py-2 hover:bg-primary-500 transition-colors text-[14px] cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
      {
        accessorKey: "placed",
        header: ({ column }) => {
          return <div className="w-[100px] ml-4 text-dark-grey-1">Filled</div>;
        },
        cell: ({ row }) => {
          // Exact when the order carries `amountBN`/`placedBN` (migration 0031),
          // otherwise the float columns. `fillProgress` owns that choice, and the
          // rule it enforces: a row in THIS table is an order the chain has not
          // cleared, so the column may never claim completion.
          const { label, title } = formatFillProgress(
            fillProgress(row.original as never)
          );
          return (
            <div className="capitalize w-[100px] text-white ml-4" title={title}>
              {label}
            </div>
          );
        },
      },
      {
        accessorKey: "total",
        header: ({ column }) => {
          return <div className="w-[100px] ml-4 text-dark-grey-1">Total</div>;
        },
        cell: ({ row }) => (
          <div
            className={`flex flex-row items-center capitalize w-[100px] text-white ml-4`}
          >
            <img
              src={`${
                row.original.isBid
                  ? row.original.quoteLogoURI
                  : row.original.baseLogoURI
              }`}
              className="w-3 h-3 rounded-full mr-1"
            />
            {adjustDecimalLength(Number.parseFloat(row.getValue("amount")), 6)}{" "}
            {row.original.isBid
              ? row.original.quoteSymbol
              : row.original.baseSymbol}
          </div>
        ),
      },
      {
        accessorKey: "cancelAll",
        header: ({ column }) => {
          const [cancelStatus, setCancelStatus] = useState<
            "none" | "pending" | "success" | "error"
          >("none");
          if (cancelStatus === "pending") {
            return (
              <div className="w-full min-w-[80px] cursor-pointer text-primary-default mr-4 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            );
          }
          return (
            <div
              className="w-full min-w-[80px] cursor-pointer text-primary-default mr-4 cursor-pointer flex items-center justify-center"
              onClick={async () => {
                table.toggleAllRowsSelected(true);
                const contractArgsData = getContractDataFromOrders(
                  getSelectedRows() as Row<SpotOrderEvent>[]
                );
                console.log(contractArgsData, "contractArgsData");
                const cancelOrdersData = {
                  address: matchingEngine as `0x${string}`,
                  abi: exchangeAbi,
                  functionName: "cancelOrders",
                  args: contractArgsData,
                };
                if (cancelOrdersData) {
                  setCancelStatus("pending");
                  try {
                    await writeContract(config, cancelOrdersData);
                    setCancelStatus("success");
                  } catch (error) {
                    setCancelStatus("none");
                    console.log(error);
                  }
                }
              }}
            >
              Cancel All
            </div>
          );
        },
        cell: ({ row }) => {
          const [cancelStatus, setCancelStatus] = useState<
            "none" | "pending" | "success" | "error"
          >("none");
          const renderRowCancelButton = (row: Row<SpotOrderEvent>) => {
            if (cancelStatus === "pending") {
              return <Loader2 className="w-4 h-4 animate-spin" />;
            }
            return (
              <Trash2
                className="w-4 h-4 cursor-pointer"
                onClick={async () => {
                  row.toggleSelected(true);
                  console.log(row, "fuck", cancelStatus);
                  const contractArgsData = getContractDataFromOrders(
                    getSelectedRows() as Row<SpotOrderEvent>[]
                  );
                  console.log(contractArgsData, "contractArgsData");
                  const cancelOrdersData = {
                    address: matchingEngine as `0x${string}`,
                    abi: exchangeAbi,
                    functionName: "cancelOrders",
                    args: contractArgsData,
                  };
                  if (cancelOrdersData) {
                    setCancelStatus("pending");
                    console.log(cancelStatus, "cancelStatus");
                    try {
                      await writeContract(config, cancelOrdersData);
                      setCancelStatus("success");
                    } catch (error) {
                      setCancelStatus("none");
                      console.log(error);
                    }
                  }
                }}
              />
            );
          };
          return (
            <div
              className={`capitalize w-full text-white cursor-pointer flex items-center justify-center`}
            >
              <Tooltip>
                <TooltipTrigger>{renderRowCancelButton(row)}</TooltipTrigger>
                <TooltipContent className="bg-white" side="left" sideOffset={8}>
                  Cancel
                </TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    [connectedNetworkName]
  );

  const [data, setData] = useState(orders);

  const table = useReactTable({
    data,
    columns,
    manualPagination: true,
    manualSorting: true,
    pageCount: ordersTotalPages,
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
    setData(orders);
  }, [orders]);

  // Add effect to handle sorting
  useEffect(() => {
    if (sorting.length > 0) {
      const { id, desc } = sorting[0];
      const sortedData = [...orders].sort((a, b) => {
        if (id === "timestamp") {
          return desc ? b.timestamp - a.timestamp : a.timestamp - b.timestamp;
        }
        if (id === "price") {
          return desc
            ? Number(b.price) - Number(a.price)
            : Number(a.price) - Number(b.price);
        }
        if (id === "amount") {
          return desc
            ? Number(b.amount) - Number(a.amount)
            : Number(a.amount) - Number(b.amount);
        }
        if (id === "placed") {
          return desc
            ? Number(b.placed) - Number(a.placed)
            : Number(a.placed) - Number(b.placed);
        }
        if (id === "pairSymbol") {
          return desc
            ? b.pairSymbol.localeCompare(a.pairSymbol)
            : a.pairSymbol.localeCompare(b.pairSymbol);
        }
        return 0;
      });
      setData(sortedData);
    } else {
      setData(orders);
    }
  }, [sorting, orders]);

  const getContractDataFromOrders = (
    rows: Row<SpotOrderEvent>[]
  ): [string[], string[], boolean[], bigint[]] => {
    const base: string[] = [];
    const quote: string[] = [];
    const isBid: boolean[] = [];
    const orderIds: bigint[] = [];

    for (const row of rows) {
      base.push(row.original.base);
      quote.push(row.original.quote);
      isBid.push(row.original.isBid);
      orderIds.push(BigInt(row.original.orderId));
    }
    return [base, quote, isBid, orderIds];
  };

  const getSelectedRows = useCallback(() => {
    return table.getFilteredSelectedRowModel().rows;
  }, [table]);

  const {
    writeContractAsync,
    isWritePending,
    isTxPending,
    isTxConfirmed,
    isTxError,
    hash,
    cancelOrdersData,
  } = useCancelOrders(
    connectedNetworkName,
    getContractDataFromOrders(getSelectedRows() as Row<SpotOrderEvent>[])
  );

  // Memoize Table
  const memoTable = () => (
    <Table>
      <TableHeader className="bg-white-8 rounded-[24px] border-b-[1px] border-neutral-light-600 h-[40px]">
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
        {table.getRowModel().rows?.length || isOrdersLoading ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="group border-b-[1px] border-white-12 text-gray-400 hover:bg-neutral-dark-500 text-[12px] h-[40px] transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="h-[40px] text-[12px] p-0">
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
            Page {pagination.pageIndex + 1} of {ordersTotalPages}
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

export default OpenOrders;
