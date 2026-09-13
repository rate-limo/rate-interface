// lib/fonts.js
import localFont from 'next/font/local';
import { DM_Mono } from 'next/font/google';

// Iter brand display font (Satoshi Variable), downloaded from Fontshare
// under its free license: https://api.fontshare.com/v2/fonts/download/satoshi
export const satoshi = localFont({
  src: [
    {
      path: '../public/fonts/Satoshi-Variable.woff2',
      style: 'normal',
    },
    {
      path: '../public/fonts/Satoshi-VariableItalic.woff2',
      style: 'italic',
    },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});

// Iter brand caption/button/label font
export const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
});
