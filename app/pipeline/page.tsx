"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import ResultCard from "@/components/ResultCard";
import { pipelineSamples } from "@/lib/data/pipeline-samples";
import { SCORE_DIMENSIONS, DIMENSION_LABELS } from "@/lib/ai/score-dimensions";
import type { CategorizeResult } from "@/lib/ai/categorize";
import type { SentimentResult } from "@/lib/ai/sentiment";
import type { EvaluateResult } from "@/lib/ai/evaluate";

type StepStatus = "pending" | "running" | "done" | "error";

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data as T;
}

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

export default function PipelinePage() {
  const [inputMode, setInputMode] = useState<"sample" | "custom">("sample");

  const [from, setFrom] = useState(pipelineSamples[0].from);
  const [subject, setSubject] = useState(pipelineSamples[0].subject);
  const [body, setBody] = useState(pipelineSamples[0].body);

  const [category, setCategory] = useState<CategorizeResult | null>(null);
  const [sentimentResult, setSentimentResult] = useState<SentimentResult | null>(null);
  const [reply, setReply] = useState("");
  const [evaluation, setEvaluation] = useState<EvaluateResult | null>(null);

  const [categorizeStatus, setCategorizeStatus] = useState<StepStatus>("pending");
  const [sentimentStatus, setSentimentStatus] = useState<StepStatus>("pending");
  const [generateStatus, setGenerateStatus] = useState<StepStatus>("pending");
  const [evaluateStatus, setEvaluateStatus] = useState<StepStatus>("pending");

  const [analyzing, setAnalyzing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const email = `Subject: ${subject.trim()}\n\n${body.trim()}`;
  const canRunAnalysis = inputMode === "sample" || (subject.trim().length > 0 && body.trim().length > 0);

  function resetResults() {
    setCategory(null);
    setSentimentResult(null);
    setReply("");
    setEvaluation(null);
    setCategorizeStatus("pending");
    setSentimentStatus("pending");
    setGenerateStatus("pending");
    setEvaluateStatus("pending");
    setError(null);
  }

  function loadSample(id: string) {
    const sample = pipelineSamples.find((s) => s.id === id);
    if (!sample) return;
    setFrom(sample.from);
    setSubject(sample.subject);
    setBody(sample.body);
    resetResults();
  }

  function useSampleMode() {
    setInputMode("sample");
    loadSample(pipelineSamples[0].id);
  }

  function useCustomMode() {
    if (inputMode !== "custom") {
      setFrom("");
      setSubject("");
      setBody("");
      resetResults();
    }
    setInputMode("custom");
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);
    setCategory(null);
    setSentimentResult(null);
    setReply("");
    setEvaluation(null);
    setEvaluateStatus("pending");
    setCategorizeStatus("running");
    setSentimentStatus("pending");
    setGenerateStatus("pending");

    let cat: CategorizeResult;
    try {
      cat = await postJSON<CategorizeResult>("/api/categorize", { email });
    } catch (err) {
      setCategorizeStatus("error");
      setError(err instanceof Error ? err.message : "Categorization failed.");
      setAnalyzing(false);
      return;
    }
    setCategory(cat);
    setCategorizeStatus("done");

    setSentimentStatus("running");
    let sent: SentimentResult;
    try {
      sent = await postJSON<SentimentResult>("/api/sentiment", { email });
    } catch (err) {
      setSentimentStatus("error");
      setError(err instanceof Error ? err.message : "Sentiment analysis failed.");
      setAnalyzing(false);
      return;
    }
    setSentimentResult(sent);
    setSentimentStatus("done");

    setGenerateStatus("running");
    try {
      const gen = await postJSON<{ reply: string }>("/api/generate", {
        email,
        sentiment: sent.sentiment,
        urgency: sent.urgency,
      });
      setReply(gen.reply);
      setGenerateStatus("done");
    } catch (err) {
      setGenerateStatus("error");
      setError(err instanceof Error ? err.message : "Reply generation failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runEvaluation() {
    if (!sentimentResult) return;
    setEvaluating(true);
    setError(null);
    setEvaluateStatus("running");
    try {
      const evalResult = await postJSON<EvaluateResult>("/api/evaluate", {
        email,
        reply,
        sentiment: sentimentResult.sentiment,
        urgency: sentimentResult.urgency,
      });
      setEvaluation(evalResult);
      setEvaluateStatus("done");
    } catch (err) {
      setEvaluateStatus("error");
      setError(err instanceof Error ? err.message : "Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  }

  const steps: { label: string; status: StepStatus }[] = [
    { label: "Categorization", status: categorizeStatus },
    { label: "Sentiment & Urgency", status: sentimentStatus },
    { label: "Generated Response", status: generateStatus },
    { label: "AI QA Evaluation", status: evaluateStatus },
  ];

  return (
    <div className="page">
      <PageHeader
        phase="Phase 5"
        title="End-to-end pipeline"
        description="The full workflow in one place: categorize the email, read sentiment and urgency, draft a reply, then QA-evaluate it before it goes out. This page reuses every module from Phases 1-4 exactly as built — it only sequences the existing API calls, nothing new was added to the AI layer itself."
      />

      <div className="field-row">
        <button
          type="button"
          className={inputMode === "sample" ? "btn btn-primary" : "btn"}
          onClick={useSampleMode}
        >
          Use a sample
        </button>
        <button
          type="button"
          className={inputMode === "custom" ? "btn btn-primary" : "btn"}
          onClick={useCustomMode}
        >
          Write your own email
        </button>
      </div>

      {inputMode === "sample" ? (
        <>
          <div className="field">
            <label htmlFor="pipeline-sample-picker">Load a sample ticket</label>
            <select id="pipeline-sample-picker" defaultValue="" onChange={(e) => loadSample(e.target.value)}>
              <option value="" disabled>
                Choose a scenario…
              </option>
              {pipelineSamples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="inbox-card">
            <div className="inbox-card-header">
              <span className="inbox-card-from">{from}</span>
              <span className="inbox-card-subject">{subject}</span>
            </div>
            <div className="field">
              <label htmlFor="pipeline-body">Email body</label>
              <textarea id="pipeline-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <div className="inbox-card">
          <p className="note">
            Enter a customer email to see how the system categorizes it, detects
            sentiment and urgency, drafts a reply, and evaluates the response.
          </p>
          <div className="field">
            <label htmlFor="custom-from">Customer name (optional)</label>
            <input
              id="custom-from"
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Alex"
            />
          </div>
          <div className="field">
            <label htmlFor="custom-subject">Subject</label>
            <input
              id="custom-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Charged twice for my subscription"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="custom-body">Email body</label>
            <textarea
              id="custom-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="I noticed two charges for the same subscription on my account. Could you please check this and let me know how it can be resolved?"
              required
            />
          </div>
          {!canRunAnalysis && <p className="note">Subject and email body are required.</p>}
        </div>
      )}

      <button className="btn btn-primary" onClick={runAnalysis} disabled={analyzing || !canRunAnalysis}>
        {analyzing ? "Running analysis…" : "Run full analysis"}
      </button>

      {error && <p className="error">{error}</p>}

      <div className="pipeline-steps">
        {steps.map((step) => (
          <div key={step.label} className={`pipeline-step step-${step.status}`}>
            <span className="dot" />
            <span>
              {step.label}
              {step.status === "running" && "…"}
              {step.status === "done" && " ✓"}
              {step.status === "error" && " ✗"}
            </span>
          </div>
        ))}
      </div>

      {(category || sentimentResult) && (
        <div className="context-strip">
          {category && (
            <div className="context-tile">
              <span className="context-label">Category</span>
              <span className="context-value">{category.category}</span>
              <span className="note">{Math.round(category.confidence * 100)}% confidence</span>
            </div>
          )}
          {sentimentResult && (
            <>
              <div className="context-tile">
                <span className="context-label">Sentiment</span>
                <span className="context-value">{sentimentResult.sentiment}</span>
              </div>
              <div className="context-tile">
                <span className="context-label">Urgency</span>
                <span className="context-value">{sentimentResult.urgency}</span>
              </div>
            </>
          )}
        </div>
      )}

      {reply && (
        <ResultCard title="Generated response (editable)">
          <p className="disclaimer-banner">
            ⚠️ This is an AI-generated draft. Review it — edit below if needed — then run the QA
            evaluation before treating it as final.
          </p>
          <div className="field">
            <label htmlFor="pipeline-reply">Reply</label>
            <textarea
              id="pipeline-reply"
              rows={9}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={runEvaluation} disabled={evaluating || !reply.trim()}>
            {evaluating ? "Evaluating…" : "Run QA evaluation"}
          </button>
        </ResultCard>
      )}

      {evaluation && (
        <>
          <ResultCard title="AI QA evaluation">
            <div className="dimension-grid">
              {SCORE_DIMENSIONS.map((dimension) => (
                <div className="dimension-item" key={dimension}>
                  <span className="dimension-label">{DIMENSION_LABELS[dimension]}</span>
                  <span className={`dimension-score score-${scoreTone(evaluation.scores[dimension])}`}>
                    {evaluation.scores[dimension]}/10
                  </span>
                </div>
              ))}
            </div>

            <div className="field">
              <label>Why this score?</label>
              <p className="reason">
                <strong>What went well: </strong>
                {evaluation.strengths}
              </p>
              <p className="reason">
                <strong>What could be improved: </strong>
                {evaluation.improvements}
              </p>
              <p className="reason">
                <strong>Most important change: </strong>
                {evaluation.topSuggestion}
              </p>
            </div>

            {evaluation.riskFlags.length > 0 && (
              <div className="field">
                <label>Risk flags</label>
                {evaluation.riskFlags.map((flag, i) => (
                  <div className="risk-flag" key={i}>
                    <strong>{flag.type}</strong>
                    {flag.explanation}
                  </div>
                ))}
              </div>
            )}
          </ResultCard>

          <div className={`final-banner final-banner-${scoreTone(evaluation.overallScore)}`}>
            <span className="final-score">{evaluation.overallScore}/10</span>
            <span className="final-verdict">{overallLabel(evaluation.overallScore)}</span>
            {evaluation.riskFlags.length > 0 && (
              <span className="note">
                {evaluation.riskFlags.length} risk flag{evaluation.riskFlags.length > 1 ? "s" : ""}{" "}
                detected — review before sending.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
