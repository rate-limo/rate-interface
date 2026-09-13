import {
    useSimulateContract,
    useWriteContract,
    useWaitForTransactionReceipt,
    useBalance,
  } from "wagmi";
  import { exchangeAbi } from "@/components/abis/exchange";
  import { matchingEngineAddress } from "@/lib/deployments";
  
  export function useCancelOrders(
    networkName: string,
    args: [string[], string[], boolean[], bigint[]]
  ) {

    // Must resolve from the SAME source MarketPageProvider uses. When this read the token
    // list directly it targeted RISE's old pre-swap engine while the market page targeted
    // the new one, so a cancel and the order it was cancelling addressed different
    // contracts.
    const matchingEngine = matchingEngineAddress(networkName);
    const { data: cancelOrdersData, queryKey: cancelOrdersQueryKey } = useSimulateContract({
      address: matchingEngine,
      abi: exchangeAbi,
      functionName: "cancelOrders",
      args,
    });
  
    const {
      data: hash,
      error: writeError,
      isPending: isWritePending,
      isError: isWriteError,
      writeContract,
      writeContractAsync,
    } = useWriteContract();
  
    const {
      data: receipt,
      isLoading: isTxPending,
      isSuccess: isTxConfirmed,
      isError: isTxError,
    } = useWaitForTransactionReceipt({
      hash,
    });
  
    return { cancelOrdersData, cancelOrdersQueryKey, isWritePending, isWriteError, writeContract, writeContractAsync, receipt, isTxPending, isTxConfirmed, isTxError, hash };
  }
  