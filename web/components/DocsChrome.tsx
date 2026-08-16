"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOC_NAV } from "@/lib/nav";
import { pluginVersion, serverVersion } from "@/lib/catalog";

function Brand() {
  return (
    <Link href="/" className="brand">
      <div className="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 4.5h5.2L4.8 13.5H3L3 4.5zm6.8 0H15v2.1H11.4l-1.1 2.7H15v2.1H9.6L6.8 4.5h3z" fill="currentColor" />
        </svg>
      </div>
      <div>
        <div className="brand-name">RoBridge</div>
        <div className="brand-sub">
          server {serverVersion} · plugin {pluginVersion}
        </div>
      </div>
    </Link>
  );
}

export function DocsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="shell">
      <button type="button" className="menu-btn" onClick={() => setOpen(true)} aria-label="Open docs menu">
        Menu
      </button>
      <div className={`backdrop${open ? " show" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar${open ? " open" : ""}`}>
        <Brand />
        <nav className="nav-groups">
          {DOC_NAV.map((group) => (
            <div key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${active ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="free-badge">All tools free · no Pro tier</div>
        </div>
      </aside>
      <div className="app">{children}</div>
    </div>
  );
}

export function Pager({
  prev,
  next,
}: {
  prev?: { href: string; label: string };
  next?: { href: string; label: string };
}) {
  return (
    <div className="pager">
      {prev ? (
        <Link href={prev.href}>
          <span className="dir">Previous</span>
          {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="next">
          <span className="dir">Next</span>
          {next.label}
        </Link>
      ) : null}
    </div>
  );
}
