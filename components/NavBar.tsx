"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  const onWorkspace = pathname === "/pipeline";

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/pipeline" className="brand">
          AI Support Lab
        </Link>
        <div className="nav-links">
          <Link
            href="/pipeline"
            className={onWorkspace ? "nav-link active" : "nav-link"}
            aria-current={onWorkspace ? "page" : undefined}
          >
            Support Workspace
          </Link>
        </div>
      </div>
    </nav>
  );
}
