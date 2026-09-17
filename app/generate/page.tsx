"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmailInput from "@/components/EmailInput";
import ResultCard from "@/components/ResultCard";
import PipelineCallout from "@/components/PipelineCallout";
import { sampleEmails, formatSampleEmail } from "@/lib/data/sample-emails";

type GenerateResponse = {
  reply: string;
  sentiment: string;
  urgency: string;
};

export default function GeneratePage() {
  const [email, setEmail] = useState(formatSampleEmail(sampleEmails[0]));
  const [reply, setReply] = useState("");
  const [meta, setMeta] = useState<{ sentiment: string; urgency: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function runGenerate() {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      const generated = data as GenerateResponse;
      setReply(generated.reply);
      setMeta({ sentiment: generated.sentiment, urgency: generated.urgency });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }

  return (
    <div className="page">
      <PageHeader
        phase="Phase 3"
        title="AI response generation"
        description="Draft a suggested reply to the incoming email, informed by the sentiment and urgency detected in Phase 2. Runs against the mock provider today (AI_PROVIDER=mock) — same provider abstraction as categorization and sentiment."
      />

      <EmailInput value={email} onChange={setEmail} />

      <button className="btn btn-primary" onClick={runGenerate} disabled={loading}>
        {loading ? "Generating…" : "Generate reply"}
      </button>

      {error && <p className="error">{error}</p>}

      {meta && (
        <ResultCard title="Generated draft">
          <div className="badge-row">
            <span className="badge badge-info">Sentiment: {meta.sentiment}</span>
            <span className="badge badge-info">Urgency: {meta.urgency}</span>
          </div>

          <p className="disclaimer-banner">
            ⚠️ This is an AI-generated draft. Review it carefully — for tone, accuracy, and
            any promises made — before sending it to a customer.
          </p>

          <div className="field">
            <label htmlFor="reply-draft">Reply (editable)</label>
            <textarea
              id="reply-draft"
              rows={10}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>

          <button className="btn" onClick={handleCopy} disabled={!reply}>
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </ResultCard>
      )}

      <PipelineCallout />
    </div>
  );
}
