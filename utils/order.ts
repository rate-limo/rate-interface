import { SpotToken } from "@/types";
import { Parser } from "json2csv";

/** The gas token's symbol, per chain this app lists. Exported on its own because
 *  callers that only have a symbol (the swap card's default-token choice) would
 *  otherwise need a second copy of this list, and two copies drift. */
export const isNativeSymbol = (symbol: string) =>
  symbol === "ETH" || symbol === "NEON" || symbol === "INJ" || symbol === "IP" || symbol === "MON" || symbol === "STT";

export const isNative = (token: SpotToken) => isNativeSymbol(token.symbol);

export const truncateTxHash = (hash: string) => {
  if (hash === undefined) {
    return "";
  }
  const truncatedHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  return truncatedHash;
};


export const exportToCSV = (data: any, fileName: string) => {
  const fields = Object.keys(data[0]); // Automatically get fields from the first object
  const json2csvParser = new Parser({ fields });
  const csv = json2csvParser.parse(data);

  // Create a blob from the CSV string
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
