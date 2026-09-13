import { defaultConnectedChain } from '@/consts';
import { getPairBySymbol } from '@/queries/server';
import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
// App router includes @vercel/og.
// No need to install it.
 
export async function GET(
  request: NextRequest,
) {

  const pair = request.nextUrl.searchParams.get('pair') as string;
  const networkName = request.nextUrl.searchParams.get('network') as string;

  const [base, quote] = pair.split('_');
  const pairData = await getPairBySymbol(networkName, base, quote);

  return new ImageResponse(
    (
      // Modified based on https://tailwindui.com/components/marketing/sections/cta-sections
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white',
        }}
      >
        <div tw="bg-gray-50 flex">
          <div tw="flex flex-col md:flex-row w-full py-12 px-4 md:items-center justify-between p-8">
            <h2 tw="flex flex-col text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-left">
              <span>Asset: {pairData?.symbol ?? `${base}/${quote}`}</span>
              <span tw="text-indigo-600">Start your free trial today.</span>
            </h2>
            <div tw="mt-8 flex md:mt-0">
              <div tw="flex rounded-md shadow">
                <a
                  href="#"
                  tw="flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-5 py-3 text-base font-medium text-white"
                >
                  Get started
                </a>
              </div>
              <div tw="ml-3 flex rounded-md shadow">
                <a
                  href="#"
                  tw="flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-indigo-600"
                >
                  Learn more
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) as React.ReactElement,
    {
      width: 1200,
      height: 630,
    },
  );
}