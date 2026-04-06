import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";
import { GameDataProvider } from "../contexts/GameDataContext";

export const metadata: Metadata = {
  title: "EOC Craft — Theorycrafting Planner",
  description: "Plan your builds with EOC Craft — Equipment, Classes, Upgrades & Formula Engine",
};

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${cinzel.variable}`}>
      <body className="min-h-full bg-[#07060c] text-zinc-100">
        <GameDataProvider>{children}</GameDataProvider>
      </body>
    </html>
  );
}
