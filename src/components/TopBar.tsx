"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clapperboard, Home, Layers, Scissors, Settings, Tv, Upload } from "lucide-react";
import { Logo } from "@/components/Logo";

const NAV = [
  { href: "/", label: "Desk", icon: Home },
  { href: "/generate", label: "Videos", icon: Layers },
  { href: "/publish", label: "Publish", icon: Upload },
  { href: "/shorts", label: "Shorts", icon: Scissors },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/channels", label: "Channels", icon: Tv },
  { href: "/youtube", label: "YouTube", icon: Clapperboard },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function TopBar() {
  const path = usePathname();

  return (
    <>
      {/* Desktop and tablet: a console bar across the top */}
      <header
        className="sticky top-0 z-30 hidden border-b md:block"
        style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)", borderColor: "var(--border)", backdropFilter: "blur(6px)" }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="MA Studio home">
            <Logo size={28} />
            <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold leading-none tracking-tight">
              MA <span style={{ fontWeight: 400 }}>Studio</span>
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-0.5" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(path, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-2 px-3 py-2 text-[13px] font-semibold transition-colors hover:text-[var(--text)]"
                  style={{
                    color: active ? "var(--text)" : "var(--text-muted)",
                    boxShadow: active ? "inset 0 -2px 0 var(--accent)" : "none",
                  }}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/settings"
            aria-current={isActive(path, "/settings") ? "page" : undefined}
            className="btn"
            style={{ padding: ".5rem .7rem" }}
          >
            <Settings size={15} />
            Settings
          </Link>
        </div>
      </header>

      {/* Phone: flat tab bar along the bottom */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t p-1.5 md:hidden"
        aria-label="Main"
        style={{ background: "var(--bg-elev)", borderColor: "var(--border)" }}
      >
        {[...NAV.slice(0, 4), { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex min-w-14 flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-semibold"
              style={{
                color: active ? "var(--text)" : "var(--text-muted)",
                boxShadow: active ? "inset 0 2px 0 var(--accent)" : "none",
              }}
            >
              <Icon size={19} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
