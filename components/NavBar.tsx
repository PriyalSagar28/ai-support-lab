"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { modules } from "@/lib/modules";

const links = [
  { href: "/", label: "Home", featured: false },
  ...modules.map((m) => ({ href: m.href, label: m.label, featured: Boolean(m.featured) })),
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          AI Support Lab
        </Link>
        <div className="nav-links">
          {links.map((link) => {
            const classes = ["nav-link"];
            if (pathname === link.href) classes.push("active");
            if (link.featured) classes.push("nav-link-featured");
            return (
              <Link key={link.href} href={link.href} className={classes.join(" ")}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
