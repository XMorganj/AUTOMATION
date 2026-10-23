import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { THEME_BOOT_SCRIPT } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Automation Studio",
  description: "From idea to published YouTube video, in one studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-accent="ember" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <div className="mx-auto flex min-h-dvh max-w-[1500px] gap-6 p-3 md:p-5">
          <Sidebar />
          <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
