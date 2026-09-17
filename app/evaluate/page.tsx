"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import ResultCard from "@/components/ResultCard";
import PipelineCallout from "@/components/PipelineCallout";
import { sampleEvaluations } from "@/lib/data/sample-evaluations";
import { SENTIMENTS, URGENCIES, type Sentiment, type Urgency } from "@/lib/ai/sentiment-labels";
import { SCORE_DIMENSIONS, DIMENSION_LABELS } from "@/lib/ai/score-dimensions";
import type { EvaluateResult } from "@/lib/ai/evaluate";

function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 8) return "good";
  if (score >= 5) return "warn";
  return "bad";
}

function overallLabel(score: number): string {
  if (score >= 8) return "Ready to send";
  if (score >= 5) return "Needs revision";
  return "Do not send as-is";
}

export default function EvaluatePage() {
  const [email, setEmail] = useState(sampleEvaluations[0].email);
  const [reply, setReply] = useState(sampleEvaluations[0].reply);
  const [sentiment, setSentiment] = useState<Sentiment>(sampleEvaluations[0].sentiment);
  const [urgency, setUrgency] = useState<Urgency>(sampleEvaluations[0].urgency);
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadSample(id: string) {
    const sample = sampleEvaluations.find((s) => s.id === id);
    if (!sample) return;
    setEmail(sample.email);
    setReply(sample.reply);
    setSentiment(sample.sentiment);
    setUrgency(sample.urgency);
    setResult(null);
    setError(null);
  }

  async function runEvaluate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reply, sentiment, urgency }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Request failed.");
      }

      setResult(data as EvaluateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        phase="Phase 4"
        title="Response evaluation"
        description="QA-review a support reply against the original email: six scored dimensions, an overall score, actionable feedback, and flags for risky claims like unsupported refund promises or invented policies. Runs against the mock provider today (AI_PROVIDER=mock) — same provider abstraction as every other module."
      />

      <div className="field">
        <label htmlFor="sample-picker">Load a sample</label>
        <select id="sample-picker" defaultValue="" onChange={(e) => loadSample(e.target.value)}>
          <option value="" disabled>
            Choose a good or poor example…
          </option>
          {sampleEvaluations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="eval-email">Customer email</label>
        <textarea id="eval-email" rows={6} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="eval-reply">Support reply to evaluate</label>
        <textarea id="eval-reply" rows={8} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="eval-sentiment">Sentiment</label>
          <select
            id="eval-sentiment"
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value as Sentiment)}
          >
            {SENTIMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="eval-urgency">Urgency</label>
          <select id="eval-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency)}>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button className="btn btn-primary" onClick={runEvaluate} disabled={loading}>
        {loading ? "Evaluating…" : "Evaluate reply"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && (
        <ResultCard title="Evaluation">
          <div className="score-hero">
            <span className={`score-number score-${scoreTone(result.overallScore)}`}>
              {result.overallScore}/10
            </span>
            <span className={`badge badge-${scoreTone(result.overallScore)}`}>
              {overallLabel(result.overallScore)}
            </span>
          </div>

          <div className="dimension-grid">
            {SCORE_DIMENSIONS.map((dimension) => (
              <div className="dimension-item" key={dimension}>
                <span className="dimension-label">{DIMENSION_LABELS[dimension]}</span>
                <span className={`dimension-score score-${scoreTone(result.scores[dimension])}`}>
                  {result.scores[dimension]}/10
                </span>
              </div>
            ))}
          </div>

          <div className="field">
            <label>What went well</label>
            <p className="reason">{result.strengths}</p>
          </div>

          <div className="field">
            <label>What could be improved</label>
            <p className="reason">{result.improvements}</p>
          </div>

          <div className="field">
            <label>Most important change</label>
            <p className="reason">
              <strong>{result.topSuggestion}</strong>
            </p>
          </div>

          <div className="field">
            <label>Risk flags</label>
            {result.riskFlags.length === 0 ? (
              <p className="no-risk-note">No risk flags detected.</p>
            ) : (
              result.riskFlags.map((flag, i) => (
                <div className="risk-flag" key={i}>
                  <strong>{flag.type}</strong>
                  {flag.explanation}
                </div>
              ))
            )}
          </div>

          <p className="note">
            Overall score is calculated from the six dimension scores above (not asked of
            the model), and is capped below 5 if a critical risk flag (an unsupported
            promise, an unverified fix claim, or an invented policy) is present.
          </p>
        </ResultCard>
      )}

      <PipelineCallout />
    </div>
  );
}
