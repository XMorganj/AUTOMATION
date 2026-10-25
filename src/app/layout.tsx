import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "@/components/TopBar";
import { THEME_BOOT_SCRIPT } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "MA Studio",
  description: "Morgan Automation Studio: from idea to published YouTube video.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-accent="signal" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <TopBar />
        <main className="mx-auto min-w-0 max-w-[1400px] px-4 pb-28 pt-6 md:px-5 md:pb-10 md:pt-8">{children}</main>
      </body>
    </html>
  );
}
