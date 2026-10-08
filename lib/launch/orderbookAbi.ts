/** `Orderbook.getOrder` — the one book read the launch ladder needs; the book has no package ABI. */
export const ORDERBOOK_GET_ORDER = [
  {
    type: "function",
    name: "getOrder",
    stateMutability: "view",
    inputs: [
      { name: "isBid", type: "bool" },
      { name: "orderId", type: "uint32" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "owner", type: "address" },
          { name: "price", type: "uint256" },
          { name: "depositAmount", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
    ],
  },
] as const;
