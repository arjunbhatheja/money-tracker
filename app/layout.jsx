import './globals.css';

export const metadata = {
  title: 'Money Tracker',
  description: 'Personal budget and spending tracker',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Money', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#121311' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
