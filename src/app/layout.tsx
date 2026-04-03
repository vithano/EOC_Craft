import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EOC Craft — Theorycrafting Planner",
  description: "Plan your builds with EOC Craft — Equipment, Classes, Upgrades & Formula Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
