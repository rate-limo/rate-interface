import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AddressDisplayProps {
  address: string;
  className?: string;
}

export function AddressDisplay({ address, className }: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const truncateAddress = (address: string) => {
    if (!address) return '--';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-gray-500">{truncateAddress(address)}</span>
      <button 
        className="text-gray-400 hover:text-gray-300 transition-colors relative"
        onClick={handleCopy}
      >
        {copied ? (
          <div className="flex items-center gap-1">
            <Check className="h-4 w-4" />
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-neutral-dark-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              Copied!
            </span>
          </div>
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>
    </div>
  );
} 