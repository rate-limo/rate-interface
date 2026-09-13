export const cardTokens = [
  {
    name: 'ANIME',
    symbol: 'ANIME',
    iconColor: '#F0A202',
    price: 0.0562,
    percentageChange: -10.08,
  },
  {
    name: 'J',
    symbol: 'J',
    iconColor: '#00D7DF',
    price: 0.0562,
    percentageChange: 10.08,
  },
  {
    name: 'MELANIA',
    symbol: 'MELANIA',
    iconColor: '#CCCCCC',
    price: 0.0562,
    percentageChange: -10.08,
  },
  {
    name: 'SONIC',
    symbol: 'SONIC',
    iconColor: '#0059FF',
    price: 0.0562,
    percentageChange: 10.08,
  },
];

export const carouselSlides = [
  {
    title: 'Welcome to Iter',
    buttonText: 'Get Started',
    buttonLink: '/',
    backgroundImage: 'images/testBg.jpg',
  },
  {
    title: 'Discover New Features',
    buttonText: 'Explore',
    buttonLink: '/',
    backgroundImage: 'images/testBg.jpg',
  },
  {
    title: 'Join Our Community',
    buttonText: 'Connect',
    buttonLink: '/',
    backgroundImage: 'images/testBg.jpg',
  },
];

export const tableTokens = [
  {
    id: '1',
    name: 'Bitcoin',
    symbol: 'BTC',
    iconColor: '#F7931A',
    price: 100739.3,
    marketCap: '$2.0T',
    volume: '$1.0M',
    percentageChange: 0.01,
    chartData: [10, 12, 11, 13, 15, 14, 16],
    isFavorite: false,
  },
  {
    id: '2',
    name: 'Aave',
    symbol: 'AAVE',
    iconColor: '#2EBAC6',
    price: 101739.3,
    marketCap: '$2.1T',
    volume: '$1.1M',
    percentageChange: -0.01,
    chartData: [16, 14, 15, 13, 11, 12, 10],
    isFavorite: false,
  },
  {
    id: '3',
    name: 'Tether',
    symbol: 'USDT',
    iconColor: '#26A17B',
    price: 102739.3,
    marketCap: '$2.2T',
    volume: '$1.2M',
    percentageChange: 0.02,
    chartData: [10, 11, 12, 11, 13, 14, 16],
    isFavorite: false,
  },
  {
    id: '4',
    name: 'Ethereum',
    symbol: 'ETH',
    iconColor: '#627EEA',
    price: 103739.3,
    marketCap: '$2.3T',
    volume: '$1.3M',
    percentageChange: 0.03,
    chartData: [11, 13, 15, 14, 12, 10, 13],
    isFavorite: false,
  },
  {
    id: '5',
    name: 'Chainlink',
    symbol: 'LINK',
    iconColor: '#2A5ADA',
    price: 104739.3,
    marketCap: '$2.4T',
    volume: '$1.4M',
    percentageChange: -0.02,
    chartData: [16, 15, 13, 14, 12, 10, 8],
    isFavorite: false,
  },
  {
    id: '6',
    name: 'Solana',
    symbol: 'SOL',
    iconColor: '#9945FF',
    price: 105739.3,
    marketCap: '$2.5T',
    volume: '$1.5M',
    percentageChange: -0.03,
    chartData: [14, 12, 10, 8, 6, 4, 2],
    isFavorite: false,
  },
  {
    id: '7',
    name: 'Shiba Inu',
    symbol: 'SHIB',
    iconColor: '#F00500',
    price: 106739.3,
    marketCap: '$2.6T',
    volume: '$1.6M',
    percentageChange: 0.04,
    chartData: [2, 4, 6, 8, 10, 12, 14],
    isFavorite: false,
  },
  {
    id: '8',
    name: 'Uniswap',
    symbol: 'UNI',
    iconColor: '#FF007A',
    price: 107739.3,
    marketCap: '$2.7T',
    volume: '$1.7M',
    percentageChange: 0.05,
    chartData: [5, 10, 7, 12, 9, 14, 11],
    isFavorite: false,
  },
];

export type TransactionType = 'Withdrawn' | 'Deposited';
export type TransactionStatus = 'Success' | 'Failed' | 'Processing';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: string;
  status: TransactionStatus;
  date: string;
};

export const sampleTransactions: Transaction[] = [
  {
    id: '1',
    type: 'Withdrawn',
    amount: '-100 $USDC',
    status: 'Success',
    date: '14th Jun 24',
  },
  {
    id: '2',
    type: 'Deposited',
    amount: '+300 $USDC',
    status: 'Success',
    date: '11th Jun 24',
  },
  {
    id: '3',
    type: 'Deposited',
    amount: '+100 $USDC',
    status: 'Failed',
    date: '12th Jun 24',
  },
  {
    id: '4',
    type: 'Withdrawn',
    amount: '-200 $USDC',
    status: 'Processing',
    date: '13th Jun 24',
  },
  {
    id: '5',
    type: 'Deposited',
    amount: '+200 $USDC',
    status: 'Failed',
    date: '15th Jun 24',
  },
];

export const tradingMetrics = [
  { label: 'PNL', value: 0.0, isCurrency: true },
  { label: 'Volume', value: 0.0, isCurrency: true },
  { label: 'Max Drawdown', value: 0.0, isPercentage: true },
  { label: 'Total Equity', value: 0.0, isCurrency: true },
  { label: 'Perps Account Equity', value: 0.0, isCurrency: true },
  { label: 'Spot Account Equity', value: 0.0, isCurrency: true },
  { label: 'Vault Equity', value: 0.0, isCurrency: true },
  { label: 'Staking Account', value: '0 HYPE' },
];

export const tradingChartData = [
  0, 0.5, 1, 1.5, 2, 1.8, 2.2, 2.3, 2.1, 1.9, 2.0, 2.2, 2.4, 2.3, 2.5, 2.6, 2.8,
  2.9, 3.0, 2.9, 2.8, 2.7, 2.9, 3.0, 2.9, 3.0, 2.9, 2.8, 2.7, 2.9,
];

// Sample data that mimics the pattern in the image
export const linearAreaChartData = [
  { month: 'Jan', value: 0 },
  { month: 'Feb', value: 20 },
  { month: 'Mar', value: 40 },
  { month: 'Apr', value: 30 },
  { month: 'May', value: 45 },
  { month: 'Jun', value: 25 },
  { month: 'Jul', value: 55 },
  { month: 'Aug', value: 40 },
  { month: 'Sep', value: 60 },
  { month: 'Oct', value: 75 },
  { month: 'Nov', value: 75 },
  { month: 'Dec', value: 65 },
  { month: 'Jan', value: 80 },
  { month: 'Feb', value: 80 },
];

export type OpenOrder = {
  id: string;
  date: string;
  pair: string;
  price: string;
  amount: string;
  filled: string;
  txHash: string;
  selected?: boolean;
};

export type TradeHistoryItem = {
  id: string;
  date: string;
  pair: string;
  price: string;
  amount: string;
  received: string;
  tradedAt: string;
  txHash: string;
  selected?: boolean;
};

// Sample data for Open Orders
export const sampleOpenOrders: OpenOrder[] = [
  {
    id: '1',
    date: '3/4/2025',
    pair: 'ETH/USDC',
    price: '2692.2994974',
    amount: '9.99 USDC',
    filled: '0 USDC',
    txHash: '0x0a5f...f53b',
    selected: false,
  },
  {
    id: '2',
    date: '3/3/2025',
    pair: 'BTC/USDC',
    price: '62845.3245',
    amount: '15.5 USDC',
    filled: '5.2 USDC',
    txHash: '0x7b3c...a42d',
    selected: false,
  },
  {
    id: '3',
    date: '3/2/2025',
    pair: 'SOL/USDC',
    price: '145.7632',
    amount: '25 USDC',
    filled: '10 USDC',
    txHash: '0x9e2f...1c8b',
    selected: false,
  },
  {
    id: '4',
    date: '2/28/2025',
    pair: 'MATIC/USDC',
    price: '0.7523',
    amount: '100 USDC',
    filled: '0 USDC',
    txHash: '0x5d1a...9f27',
    selected: false,
  },
  {
    id: '5',
    date: '2/27/2025',
    pair: 'AVAX/USDC',
    price: '36.429',
    amount: '12.5 USDC',
    filled: '6.3 USDC',
    txHash: '0x2c4b...e12f',
    selected: false,
  },
];

// Sample data for Trade History
export const sampleTradeHistory: TradeHistoryItem[] = [
  {
    id: '1',
    date: '2/24/2025',
    pair: 'ETH/USDC',
    price: '2692.2997267',
    amount: '53.60258 USDC',
    received: '0.019958494 ETH',
    tradedAt: '1 Month Ago',
    txHash: '0x428a...fcdc',
    selected: false,
  },
  {
    id: '2',
    date: '2/24/2025',
    pair: 'ETH/USDC',
    price: '2649.9999999',
    amount: '38.40399 USDC',
    received: '0.014378949 ETH',
    tradedAt: '1 Month Ago',
    txHash: '0x2e2c...7855',
    selected: false,
  },
  {
    id: '3',
    date: '2/20/2025',
    pair: 'ETH/USDC',
    price: '2250.5483',
    amount: '105.2347 USDC',
    received: '0.046375983 ETH',
    tradedAt: '1 Month Ago',
    txHash: '0xf81b...3d29',
    selected: false,
  },
  {
    id: '4',
    date: '2/15/2025',
    pair: 'ETH/USDC',
    price: '3124.7823',
    amount: '78.1198 USDC',
    received: '0.024968473 ETH',
    tradedAt: '1 Month Ago',
    txHash: '0xa3c7...9b2f',
    selected: false,
  },
  {
    id: '5',
    date: '2/10/2025',
    pair: 'ETH/USDC',
    price: '2895.4325',
    amount: '43.4315 USDC',
    received: '0.014999827 ETH',
    tradedAt: '1 Month Ago',
    txHash: '0x6e5d...4c8a',
    selected: false,
  },
];
