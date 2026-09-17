"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmailInput from "@/components/EmailInput";
import ResultCard from "@/components/ResultCard";
import PipelineCallout from "@/components/PipelineCallout";
import { sampleEmails, formatSampleEmail } from "@/lib/data/sample-emails";
import type { CategorizeResult } from "@/lib/ai/categorize";

export default function CategorizePage() {
  const [email, setEmail] = useState(formatSampleEmail(sampleEmails[0]));
  const [result, setResult] = useState<CategorizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCategorize() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      setResult(data as CategorizeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        phase="Phase 1"
        title="Email categorization"
        description="Classify an incoming support email into a category by prompting an AI provider for structured JSON. Powered by Google Gemini via the provider-agnostic interface in lib/ai/provider.ts (a mock provider is also available for offline demos)."
      />

      <EmailInput value={email} onChange={setEmail} />

      <button className="btn btn-primary" onClick={runCategorize} disabled={loading}>
        {loading ? "Categorizing…" : "Categorize email"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <ResultCard title="Result">
          <div className="kv">
            <span>Category</span>
            <strong>{result.category}</strong>
          </div>
          <div className="kv">
            <span>Confidence</span>
            <strong>{Math.round(result.confidence * 100)}%</strong>
          </div>
          <p className="reason">{result.reason}</p>
          <p className="note">
            Confidence is the model&apos;s self-reported certainty, not a calibrated
            probability — treat it as a triage signal, not a guarantee.
          </p>
        </ResultCard>
      )}

      <PipelineCallout />
    </div>
  );
}
