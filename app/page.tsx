import Link from "next/link";
import { modules } from "@/lib/modules";

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <span className="badge badge-mock">Live · powered by Google Gemini</span>
        <h1>AI Support Lab</h1>
        <p className="lede">
          An end-to-end AI workflow for customer-support email handling: categorizing
          incoming emails, reading sentiment and urgency, drafting a reply, and — the
          hard part — evaluating how good that reply actually is. Every module below
          runs against Google Gemini for real AI output.
        </p>
        <p className="disclaimer">Independent project, built solo.</p>
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
          <li>Next.js (App Router) + TypeScript, deployed on Vercel.</li>
          <li>
            Every AI capability goes through one provider-agnostic interface
            (lib/ai/provider.ts) — a mock provider for offline demos, and a real
            Google Gemini provider for production output, selected via the
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
