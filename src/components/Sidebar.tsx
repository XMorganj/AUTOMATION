"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Clapperboard,
  Home,
  Layers,
  Scissors,
  Settings,
  Sparkles,
  Tv,
  Upload,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/generate", label: "Generate", icon: Layers },
  { href: "/publish", label: "Publish", icon: Upload },
  { href: "/shorts", label: "Shorts", icon: Scissors },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/channels", label: "Channels", icon: Tv },
  { href: "/youtube", label: "YouTube", icon: Clapperboard },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Sidebar() {
  const path = usePathname();

  return (
    <>
      {/* Desktop */}
      <aside className="glass sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-60 shrink-0 flex-col p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 py-1">
          <span
            className="grid size-9 place-items-center rounded-xl"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "var(--accent-ink)" }}
          >
            <Sparkles size={18} strokeWidth={2.4} />
          </span>
          <span className="text-[15px] font-bold leading-tight tracking-tight">
            Automation
            <br />
            Studio
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                        color: "var(--accent-ink)",
                      }
                    : { color: "var(--text-muted)" }
                }
              >
                <Icon size={17} />
                {label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/settings"
          aria-current={isActive(path, "/settings") ? "page" : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--surface-hover)]"
          style={{ color: isActive(path, "/settings") ? "var(--accent)" : "var(--text-muted)" }}
        >
          <Settings size={17} />
          Settings
        </Link>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        className="glass fixed inset-x-3 bottom-3 z-30 flex justify-around p-1.5 md:hidden"
        aria-label="Main"
        style={{ borderRadius: 22, background: "color-mix(in srgb, var(--bg-elev) 94%, transparent)" }}
      >
        {[...NAV.slice(0, 4), { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10px] font-semibold"
              style={active ? { color: "var(--accent)" } : { color: "var(--text-muted)" }}
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
