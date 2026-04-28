"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/topics", label: "Topics" },
  { href: "/visualizations", label: "Visualizations" },
  { href: "/explorer", label: "Explorer" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header sticky top-0 z-40 border-b border-[var(--line)] shadow-sm backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-serif text-lg font-bold">
          <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)]">
            <Landmark className="h-5 w-5 text-[var(--accent)]" />
          </span>
          <span className="brand-name">Agent Senate</span>
        </Link>
        <nav className="senate-tabs flex items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--card)] p-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--card-muted)] hover:text-[var(--foreground)]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
