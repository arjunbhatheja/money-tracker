import './globals.css';

export const metadata = {
  title: 'Money Tracker',
  description: 'Personal budget and spending tracker',
  robots: { index: false, follow: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
