import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HostReady",
  description: "Describe your event once. Get your council permit and liquor licence pack, checked and on time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NZ" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <main className="flex-1">{children}</main>
        {/* Liability line required on every screen (TRD: Security, privacy and scraping compliance). */}
        <footer className="px-4 py-3 text-xs text-neutral-500">
          HostReady prepares documents. You review them and lodge them with the council. This is not legal advice.
        </footer>
      </body>
    </html>
  );
}
