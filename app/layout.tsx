import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chaupal Seals",
  description: "A soulbound seal of belonging for every Chaupal community group.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
