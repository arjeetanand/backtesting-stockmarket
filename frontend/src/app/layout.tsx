import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Quant Research Terminal",
  description:
    "AI-native quantitative trading research and backtesting platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{ background: "#FAFAFA", color: "#0F172A" }}
        className="min-h-screen"
      >
        <Sidebar />
        <main
          className="min-h-screen"
          style={{ marginLeft: "256px" }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
