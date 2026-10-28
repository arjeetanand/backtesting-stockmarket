import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Backtrack — NSE research",
  description: "Local Indian-equity research using official NSE daily archives and simulated backtests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={{ background: "#f7f9fb", color: "#191c1e" }}
        className="min-h-screen"
      >
        <Sidebar />
        <main className="min-h-screen bt-app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
