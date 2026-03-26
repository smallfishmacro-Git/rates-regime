import './globals.css';

export const metadata = {
  title: 'SmallFish | Rates Regime',
  description: 'SmallFishMacro Terminal — Rates Regime Dashboard',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
