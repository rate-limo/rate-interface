/**
 * NFTBarterMatchingEngine ABI, generated from the forge artifact for NFTBarterMatchingEngine.sol. Do not hand-edit.
 *
 * The `error` entries are the load-bearing part off-chain: viem decodes a revert by
 * matching its 4-byte selector against these, so an error missing here surfaces to the
 * user as an undecodable hex blob instead of a sentence. See
 * apps/web/lib/errors/contractError.ts, which is what turns them into toast copy.
 */
export const NFTBarterMatchingEngineABI = [
  {
    "type": "function",
    "name": "acceptOffer",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createOffer",
    "inputs": [
      {
        "name": "offered",
        "type": "tuple",
        "internalType": "struct NFTAsset.Item",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "standard",
            "type": "uint8",
            "internalType": "enum NFTAsset.Standard"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "wanted",
        "type": "tuple",
        "internalType": "struct NFTAsset.Item",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "standard",
            "type": "uint8",
            "internalType": "enum NFTAsset.Standard"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "expire",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextOfferId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "offers",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "maker",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "offered",
        "type": "tuple",
        "internalType": "struct NFTAsset.Item",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "standard",
            "type": "uint8",
            "internalType": "enum NFTAsset.Standard"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "wanted",
        "type": "tuple",
        "internalType": "struct NFTAsset.Item",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "standard",
            "type": "uint8",
            "internalType": "enum NFTAsset.Standard"
          },
          {
            "name": "tokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "active",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "onERC1155BatchReceived",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "onERC1155Received",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "onERC721Received",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "event",
    "name": "OfferCancelled",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferCreated",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "maker",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "offeredToken",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "offeredId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "offeredAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "wantedToken",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "wantedId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "wantedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferExpired",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OfferFilled",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "taker",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ERC721AmountNotOne",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "ExpiryNotInFuture",
    "inputs": [
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "timestamp",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "Inactive",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotExpired",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotMaker",
    "inputs": [
      {
        "name": "offerId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "maker",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "OfferedIsWanted",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroToken",
    "inputs": []
  }
] as const;
