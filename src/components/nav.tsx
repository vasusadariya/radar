"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Radar" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/outreach", label: "Outreach" },
  { href: "/stats", label: "Stats" },
  { href: "/capture", label: "Capture" },
  { href: "/profile", label: "Profile" },
];

/** Shows a spinner on the link you just clicked until the page arrives. */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px] opacity-70" />
  ) : null;
}

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Radar
        </Link>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors ${
                  active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200"
                }`}
              >
                {l.label}
                <Pending />
              </Link>
            );
          })}
        </nav>
        <Link href="/leads/new" className="btn-primary ml-auto hidden sm:inline-flex">
          + Add lead
        </Link>
      </div>
    </header>
  );
}
