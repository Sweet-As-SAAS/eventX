import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { Toaster } from "@/components/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display face: Gridset-style neo-grotesque, medium weight, tight tracking (brand.md)
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EvntX", template: "%s · EvntX" },
  description: "Describe your event once. Get a council-ready permit and liquor licence pack, checked and on time.",
};

export const viewport: Viewport = { themeColor: "#2447D9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NZ" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Toaster>
          <main className="flex-1">{children}</main>
        </Toaster>
        {/* Liability line required on every screen (TRD: Security, privacy and scraping compliance). */}
        <footer className="mx-auto w-full max-w-6xl px-4 pb-6 pt-10 text-sm text-muted-foreground sm:px-6">
          EvntX prepares documents. You review them and lodge them with the council. This is not legal advice.
        </footer>
      </body>
    </html>
  );
}
