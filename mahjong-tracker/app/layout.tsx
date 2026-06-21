import type { Metadata, Viewport } from 'next';
import './globals.css';
import SWRegister from './components/SWRegister';

export const metadata: Metadata = {
  title: 'Mahjong Tracker',
  description: 'Track your American Mahjong wins and clear all 70 hands this year.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mahjong',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2F6BFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
