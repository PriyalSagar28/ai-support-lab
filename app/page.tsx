import Link from "next/link";
import { modules } from "@/lib/modules";

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <span className="badge badge-mock">5 phases · fully working demo</span>
        <h1>AI Support Lab</h1>
        <p className="lede">
          A learning project for the core AI capabilities behind a customer-support
          product: categorizing emails, reading sentiment, drafting suggested replies,
          and — the hard part — measuring how good those replies actually are. Every
          module below runs end to end today against a mock AI provider, no API key
          required.
        </p>
        <p className="disclaimer">Personal learning project, built to learn by doing.</p>
        <Link href="/pipeline" className="btn btn-primary">
          Try the full pipeline →
        </Link>
      </section>

      <section>
        <h2 className="section-label">Modules</h2>
        <div className="module-grid">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={m.featured ? "module-card module-card-featured" : "module-card"}
            >
              <span className="badge badge-mock">{m.phase}</span>
              <h3>{m.label}</h3>
              <p>{m.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-label">How this is built</h2>
        <ul className="rules">
          <li>Next.js (App Router) + TypeScript, deployed later on Vercel.</li>
          <li>
            Every AI capability goes through one provider-agnostic interface
            (lib/ai/provider.ts) — starting with a mock provider, swappable via the
            AI_PROVIDER environment variable.
          </li>
          <li>No API key ever reaches the browser — all AI calls run server-side.</li>
          <li>
            The pipeline reuses the same categorize/sentiment/generate/evaluate API
            routes as the individual module pages — nothing new was added to the AI
            layer to build it, it just sequences existing calls.
          </li>
        </ul>
      </section>
    </div>
  );
}
