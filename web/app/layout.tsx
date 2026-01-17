import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEC Dilution Alerts",
  description: "Short seller alerts for SEC dilution filings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
