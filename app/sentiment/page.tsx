"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmailInput from "@/components/EmailInput";
import ResultCard from "@/components/ResultCard";
import PipelineCallout from "@/components/PipelineCallout";
import { sampleEmails, formatSampleEmail } from "@/lib/data/sample-emails";
import type { SentimentResult } from "@/lib/ai/sentiment";

export default function SentimentPage() {
  const [email, setEmail] = useState(formatSampleEmail(sampleEmails[3]));
  const [result, setResult] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSentiment() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      setResult(data as SentimentResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        phase="Phase 2"
        title="Sentiment analysis"
        description="Detect the customer's sentiment (positive, neutral, negative) and urgency (low, medium, high) so tickets can be triaged automatically. Runs against the mock provider today (AI_PROVIDER=mock) — same provider abstraction as categorization."
      />

      <EmailInput value={email} onChange={setEmail} />

      <button className="btn btn-primary" onClick={runSentiment} disabled={loading}>
        {loading ? "Analyzing…" : "Analyze sentiment"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <ResultCard title="Result">
          <div className="kv">
            <span>Sentiment</span>
            <strong>{result.sentiment}</strong>
          </div>
          <div className="kv">
            <span>Urgency</span>
            <strong>{result.urgency}</strong>
          </div>
          <div className="kv">
            <span>Confidence</span>
            <strong>{Math.round(result.confidence * 100)}%</strong>
          </div>
          <p className="reason">{result.explanation}</p>
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
