import { TokenCardRow } from '@/components/Molecules/TokenCardRow';
import { SpotToken } from '@/types';

type TokenCardProps = {
  title: string;
  networkSlug: string;
  tokens: SpotToken[];
  loading?: boolean;
};

export function TokenCard({ title, networkSlug, tokens, loading = false }: TokenCardProps) {
  return (
    <div className="bg-neutral-dark-600 border-neutral-light-white-12 w-full rounded-[16px] border p-4">
      <h2 className="text-dark-grey-1 mb-6 text-sm font-medium">{title}</h2>
      {loading ? (
        Array(4).fill(0).map((_, index) => (
          <TokenCardRow
            networkSlug={networkSlug}
            key={index}
            name=""
            symbol=""
            logoURI=""
            iconColor=""
            price={0}
            percentageChange={0}
            loading={true}
          />
        ))
      ) : (
        tokens?.map((token, index) => (
          <TokenCardRow
            networkSlug={networkSlug}
            key={index}
            name={token.name}
            symbol={token.symbol}
            logoURI={token.logoURI}
            iconColor={token.logoURI}
            price={token.priceUSD}
            percentageChange={token.dayPriceDifferencePercentage}
          />
        ))
      )}
    </div>
  );
}
