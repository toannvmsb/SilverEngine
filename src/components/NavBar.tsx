"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ROLE_LABELS, RoleName } from "@/lib/roles";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Executive" },
  { href: "/market", label: "Market Data" },
  { href: "/policy", label: "Policy" },
  { href: "/calculator", label: "Calculator" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/data-quality", label: "Data Quality" },
  { href: "/governance", label: "Governance" },
  { href: "/audit", label: "Audit" },
];

export default function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (pathname === "/login") return null;

  const links = session?.user?.role === "SYSTEM_ADMIN" ? [...LINKS, { href: "/users", label: "Users" }] : LINKS;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-slate-800">SilverGuard</span>
          <nav className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  pathname === l.href
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {session?.user && (
            <>
              <span>
                {session.user.name} ·{" "}
                <span className="font-medium text-slate-800">
                  {ROLE_LABELS[session.user.role as RoleName] ?? session.user.role}
                </span>
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Đăng xuất
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
