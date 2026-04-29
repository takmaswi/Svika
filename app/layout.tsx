import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Svika — digital tickets, real revenue, same kombi",
  description:
    "Digital ticketing and trip-planning for Harare's informal kombi network. Transferable tickets, walking-transfer trip plans, real fleet revenue.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://svika.vercel.app"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FFFFFF",
};

// Inline-injected before body renders so the first paint matches the user's
// stored or system preference. Hits localStorage svika-theme first, then
// prefers-color-scheme. Falls back to "light" when storage is unavailable
// (private mode etc).
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('svika-theme');
    var system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
    var theme = stored === 'dark' || stored === 'light' ? stored : system;
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
