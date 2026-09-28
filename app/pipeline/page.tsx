"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import WorkflowTimeline, { type WorkflowStage } from "@/components/WorkflowTimeline";
import { pipelineSamples } from "@/lib/data/pipeline-samples";
import { SCORE_DIMENSIONS, DIMENSION_LABELS, type ScoreDimension } from "@/lib/ai/score-dimensions";
import type { CategorizeResult } from "@/lib/ai/categorize";
import type { SentimentResult } from "@/lib/ai/sentiment";
import type { EvaluateResult } from "@/lib/ai/evaluate";
import type { RetrievedChunk } from "@/lib/ai/knowledge/types";

type StepStatus = "pending" | "running" | "done" | "error";
type StageId = "request" | "analysis" | "knowledge" | "response" | "quality";
type Failure = { stage: StageId; message: string };

const STAGES: { id: StageId; label: string; shortLabel: string }[] = [
  { id: "request", label: "Customer request", shortLabel: "Request" },
  { id: "analysis", label: "AI analysis", shortLabel: "Analysis" },
  { id: "knowledge", label: "Knowledge used", shortLabel: "Knowledge" },
  { id: "response", label: "Suggested response", shortLabel: "Reply" },
  { id: "quality", label: "Quality check", shortLabel: "Quality" },
];

const sectionId = (id: StageId) => `ws-${id}`;

class RequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new RequestError(data.error ?? "Request failed.", data.code);
  }
  return data as T;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
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

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

// "Groundedness (no hallucination)" → "Groundedness": the parenthetical is
// prompt-facing guidance, not a product label.
function shortDimensionLabel(label: string): string {
  return label.replace(/\s*\(.*\)$/, "");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Retrieval can return several excerpts (chunks) from the same document, so
// "sources" counts distinct documents and "excerpts" counts chunks.
function describeKnowledge(chunks: RetrievedChunk[]): { sources: number; excerpts: number } {
  return { sources: new Set(chunks.map((chunk) => chunk.source)).size, excerpts: chunks.length };
}

// Reader-facing explanations for the "How scoring works" disclosure. These
// summarize, in product language, what the evaluator scores each dimension on.
const DIMENSION_HELP: Record<ScoreDimension, string> = {
  toneEmpathy: "Respectful, appropriate and empathetic communication.",
  relevance: "Directly addresses the customer's actual request.",
  clarity: "Easy to understand and actionable.",
  completeness: "Answers the customer's questions and covers necessary details.",
  professionalism: "Appropriate support-agent writing quality.",
  groundedness: "Company-specific claims are supported by the available knowledge or the customer's message.",
};

const CHUNK_PREVIEW_CHARS = 180;

// Chunk text is "<section heading>\n\n<body>" (see lib/ai/knowledge/chunk.ts),
// so split it back apart for display: heading as the label, body as a
// whitespace-collapsed preview trimmed at a word boundary.
function describeChunk(chunk: RetrievedChunk): { section: string; preview: string } {
  const splitAt = chunk.text.indexOf("\n\n");
  const section = splitAt === -1 ? "" : chunk.text.slice(0, splitAt).trim();
  const body = (splitAt === -1 ? chunk.text : chunk.text.slice(splitAt + 2)).replace(/\s+/g, " ").trim();
  if (body.length <= CHUNK_PREVIEW_CHARS) return { section, preview: body };
  const cut = body.slice(0, CHUNK_PREVIEW_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return { section, preview: `${cut.slice(0, lastSpace > 0 ? lastSpace : cut.length)}…` };
}

function Section({
  id,
  step,
  title,
  description,
  children,
}: {
  id: StageId;
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={sectionId(id)} className="ws-section" aria-labelledby={`${sectionId(id)}-title`}>
      <header className="ws-section-header">
        <span className="ws-step" aria-hidden="true">
          {step}
        </span>
        <div>
          <h2 id={`${sectionId(id)}-title`} tabIndex={-1}>
            {title}
          </h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="ws-card">{children}</div>
    </section>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return <p className="ws-empty">{children}</p>;
}

function Loading({ children }: { children: ReactNode }) {
  return (
    <p className="ws-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {children}
    </p>
  );
}

function StageError({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="ws-error" role="alert">
      <p>{message}</p>
      {action}
    </div>
  );
}

export default function SupportWorkspacePage() {
  const [inputMode, setInputMode] = useState<"sample" | "custom">("sample");
  const [selectedSampleId, setSelectedSampleId] = useState(pipelineSamples[0].id);

  const [from, setFrom] = useState(pipelineSamples[0].from);
  const [subject, setSubject] = useState(pipelineSamples[0].subject);
  const [body, setBody] = useState(pipelineSamples[0].body);

  // The email the current results were produced from. Re-checking quality
  // after editing the reply is judged against this, not the live inputs.
  const [analyzedEmail, setAnalyzedEmail] = useState("");

  const [category, setCategory] = useState<CategorizeResult | null>(null);
  const [sentimentResult, setSentimentResult] = useState<SentimentResult | null>(null);
  const [reply, setReply] = useState("");
  const [retrievedChunks, setRetrievedChunks] = useState<RetrievedChunk[]>([]);
  const [evaluation, setEvaluation] = useState<EvaluateResult | null>(null);
  const [evaluatedReply, setEvaluatedReply] = useState("");

  const [categorizeStatus, setCategorizeStatus] = useState<StepStatus>("pending");
  const [sentimentStatus, setSentimentStatus] = useState<StepStatus>("pending");
  const [generateStatus, setGenerateStatus] = useState<StepStatus>("pending");
  const [generateErrorCode, setGenerateErrorCode] = useState<string | undefined>();
  const [evaluateStatus, setEvaluateStatus] = useState<StepStatus>("pending");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [viewing, setViewing] = useState<StageId>("request");

  const controllerRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const email = `Subject: ${subject.trim()}\n\n${body.trim()}`;
  const hasInput = subject.trim().length > 0 && body.trim().length > 0;
  const busy = [categorizeStatus, sentimentStatus, generateStatus, evaluateStatus].includes("running");
  const hasRun = categorizeStatus !== "pending";
  const requestChanged = hasRun && !busy && email !== analyzedEmail;
  const replyEdited = evaluation !== null && reply !== evaluatedReply;

  // Scroll spy: the section whose top has passed ~30% of the viewport is the
  // one being read. At the very bottom of the page, the last section wins.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current: StageId = STAGES[0].id;
      for (const stage of STAGES) {
        const el = document.getElementById(sectionId(stage.id));
        if (el && el.getBoundingClientRect().top <= line) current = stage.id;
      }
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight > window.innerHeight + 4;
      if (scrollable && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
        current = STAGES[STAGES.length - 1].id;
      }
      setViewing(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const scrollToStage = useCallback((id: string) => {
    const section = document.getElementById(sectionId(id as StageId));
    if (!section) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    document.getElementById(`${sectionId(id as StageId)}-title`)?.focus({ preventScroll: true });
    setViewing(id as StageId);
  }, []);

  function clearResults() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setAnalyzedEmail("");
    setCategory(null);
    setSentimentResult(null);
    setReply("");
    setRetrievedChunks([]);
    setEvaluation(null);
    setEvaluatedReply("");
    setCategorizeStatus("pending");
    setSentimentStatus("pending");
    setGenerateStatus("pending");
    setGenerateErrorCode(undefined);
    setEvaluateStatus("pending");
    setFailure(null);
    setAnalysisRunning(false);
    setCopyState("idle");
  }

  function loadSample(id: string) {
    const sample = pipelineSamples.find((s) => s.id === id);
    if (!sample) return;
    setSelectedSampleId(sample.id);
    setFrom(sample.from);
    setSubject(sample.subject);
    setBody(sample.body);
    clearResults();
  }

  function selectSampleMode() {
    if (inputMode === "sample") return;
    setInputMode("sample");
    loadSample(pipelineSamples[0].id);
  }

  function selectCustomMode() {
    if (inputMode === "custom") return;
    setInputMode("custom");
    setSelectedSampleId("");
    setFrom("");
    setSubject("");
    setBody("");
    clearResults();
  }

  function reset() {
    setSelectedSampleId("");
    setFrom("");
    setSubject("");
    setBody("");
    clearResults();
  }

  async function checkQuality(
    forEmail: string,
    forReply: string,
    sentiment: SentimentResult,
    chunks: RetrievedChunk[],
    signal: AbortSignal
  ) {
    setEvaluateStatus("running");
    setEvaluation(null);
    setFailure(null);
    try {
      const result = await postJSON<EvaluateResult>(
        "/api/evaluate",
        {
          email: forEmail,
          reply: forReply,
          sentiment: sentiment.sentiment,
          urgency: sentiment.urgency,
          // The exact chunks generation retrieved for this reply — judges
          // groundedness against what the model actually had, not a fresh
          // (and potentially different) retrieval.
          retrievedChunks: chunks,
        },
        signal
      );
      if (signal.aborted) return;
      setEvaluation(result);
      setEvaluatedReply(forReply);
      setEvaluateStatus("done");
    } catch (err) {
      if (signal.aborted) return;
      setEvaluateStatus("error");
      setFailure({ stage: "quality", message: errorMessage(err, "The quality check could not be completed.") });
    }
  }

  async function runAnalysis() {
    if (!hasInput || busy) return;
    const forEmail = email;
    clearResults();
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    setAnalysisRunning(true);
    try {
      await runSteps(forEmail, signal);
    } finally {
      if (!signal.aborted) setAnalysisRunning(false);
    }
  }

  async function runSteps(forEmail: string, signal: AbortSignal) {
    setAnalyzedEmail(forEmail);
    setCategorizeStatus("running");

    let cat: CategorizeResult;
    try {
      cat = await postJSON<CategorizeResult>("/api/categorize", { email: forEmail }, signal);
    } catch (err) {
      if (signal.aborted) return;
      setCategorizeStatus("error");
      setFailure({ stage: "analysis", message: errorMessage(err, "The request could not be categorized.") });
      return;
    }
    if (signal.aborted) return;
    setCategory(cat);
    setCategorizeStatus("done");

    setSentimentStatus("running");
    let sent: SentimentResult;
    try {
      sent = await postJSON<SentimentResult>("/api/sentiment", { email: forEmail }, signal);
    } catch (err) {
      if (signal.aborted) return;
      setSentimentStatus("error");
      setFailure({ stage: "analysis", message: errorMessage(err, "Sentiment and urgency could not be determined.") });
      return;
    }
    if (signal.aborted) return;
    setSentimentResult(sent);
    setSentimentStatus("done");

    setGenerateStatus("running");
    let gen: { reply: string; retrievedChunks: RetrievedChunk[] };
    try {
      gen = await postJSON<{ reply: string; retrievedChunks: RetrievedChunk[] }>(
        "/api/generate",
        { email: forEmail, sentiment: sent.sentiment, urgency: sent.urgency },
        signal
      );
    } catch (err) {
      if (signal.aborted) return;
      const code = err instanceof RequestError ? err.code : undefined;
      setGenerateStatus("error");
      setGenerateErrorCode(code);
      setFailure({
        stage: code === "KNOWLEDGE_RETRIEVAL_FAILED" ? "knowledge" : "response",
        message: errorMessage(err, "The response could not be drafted."),
      });
      return;
    }
    if (signal.aborted) return;
    const chunks = gen.retrievedChunks ?? [];
    setReply(gen.reply);
    setRetrievedChunks(chunks);
    setGenerateStatus("done");

    await checkQuality(forEmail, gen.reply, sent, chunks, signal);
  }

  function recheckQuality() {
    if (!sentimentResult || !reply.trim() || busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void checkQuality(analyzedEmail, reply, sentimentResult, retrievedChunks, controller.signal);
  }

  async function copyReply() {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    try {
      await navigator.clipboard.writeText(reply);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    copyTimerRef.current = setTimeout(() => setCopyState("idle"), 2500);
  }

  // ---- Workflow timeline, derived only from real request state ----

  const knowledge = describeKnowledge(retrievedChunks);
  const retrievalFailed = generateStatus === "error" && generateErrorCode === "KNOWLEDGE_RETRIEVAL_FAILED";

  function analysisStage(): Pick<WorkflowStage, "state" | "running" | "caption"> {
    if (categorizeStatus === "error" || sentimentStatus === "error")
      return { state: "error", running: false, caption: "Analysis failed" };
    if (categorizeStatus === "done" && sentimentStatus === "done")
      return { state: "done", running: false, caption: category?.category ?? "Complete" };
    if (categorizeStatus === "running") return { state: "active", running: true, caption: "Categorizing" };
    if (sentimentStatus === "running") return { state: "active", running: true, caption: "Reading sentiment & urgency" };
    return { state: "upcoming", running: false, caption: "" };
  }

  function knowledgeStage(): Pick<WorkflowStage, "state" | "running" | "caption"> {
    // Retrieval runs server-side inside the draft request, so it is only
    // marked complete once that request returns the retrieved sources.
    if (generateStatus === "running") return { state: "active", running: true, caption: "Searching knowledge base" };
    if (generateStatus === "done")
      return {
        state: "done",
        running: false,
        caption:
          knowledge.excerpts === 0
            ? "No sources"
            : `${plural(knowledge.sources, "source")} · ${plural(knowledge.excerpts, "excerpt")}`,
      };
    if (retrievalFailed) return { state: "error", running: false, caption: "Retrieval failed" };
    return { state: "upcoming", running: false, caption: "" };
  }

  function responseStage(): Pick<WorkflowStage, "state" | "running" | "caption"> {
    if (generateStatus === "running") return { state: "upcoming", running: false, caption: "Waiting for sources" };
    if (generateStatus === "done")
      return { state: "done", running: false, caption: replyEdited ? "Edited" : "Draft ready" };
    if (generateStatus === "error")
      return retrievalFailed
        ? { state: "upcoming", running: false, caption: "Not drafted" }
        : { state: "error", running: false, caption: "Drafting failed" };
    return { state: "upcoming", running: false, caption: "" };
  }

  function qualityStage(): Pick<WorkflowStage, "state" | "running" | "caption"> {
    if (evaluateStatus === "running") return { state: "active", running: true, caption: "Reviewing response" };
    if (evaluateStatus === "error") return { state: "error", running: false, caption: "Check failed" };
    if (evaluateStatus === "done" && evaluation)
      return {
        state: "done",
        running: false,
        caption: replyEdited ? "Re-check after edits" : `${formatScore(evaluation.overallScore)} / 10`,
      };
    return { state: "upcoming", running: false, caption: "" };
  }

  const stageDetails: Record<StageId, Pick<WorkflowStage, "state" | "running" | "caption">> = {
    request: hasRun
      ? { state: "done", running: false, caption: "Submitted" }
      : { state: "active", running: false, caption: hasInput ? "Ready to analyze" : "Add a customer email" },
    analysis: analysisStage(),
    knowledge: knowledgeStage(),
    response: responseStage(),
    quality: qualityStage(),
  };

  const stages: WorkflowStage[] = STAGES.map((s) => ({ ...s, ...stageDetails[s.id] }));

  let workflowSummary = "Waiting for a customer request";
  if (busy) workflowSummary = "Working…";
  else if (failure) workflowSummary = `Stopped at ${STAGES.find((s) => s.id === failure.stage)?.label.toLowerCase()}`;
  else if (evaluateStatus === "done") workflowSummary = "Response reviewed";

  return (
    <div className="workspace">
      <header className="workspace-header">
        <p className="workspace-eyebrow">Support workspace</p>
        <h1>AI Support Copilot</h1>
        <p className="workspace-lede">Turn a customer email into a grounded, quality-checked support response.</p>
        <p className="workspace-sub">
          Analyze the request, retrieve relevant knowledge, draft a response, and review it before sending.
        </p>
      </header>

      <div className="workspace-grid">
        <aside className="workspace-aside">
          <WorkflowTimeline stages={stages} viewing={viewing} summary={workflowSummary} onSelect={scrollToStage} />
        </aside>

        <div className="workspace-main">
          {/* 1. Customer request */}
          <Section id="request" step={1} title="Customer request" description="Start from a sample scenario or write your own customer email.">
            <div className="segmented" role="group" aria-label="Email source">
              <button
                type="button"
                className="segmented-option"
                aria-pressed={inputMode === "sample"}
                onClick={selectSampleMode}
                disabled={busy}
              >
                Use a sample
              </button>
              <button
                type="button"
                className="segmented-option"
                aria-pressed={inputMode === "custom"}
                onClick={selectCustomMode}
                disabled={busy}
              >
                Write your own email
              </button>
            </div>

            {inputMode === "sample" ? (
              <>
                <div className="field">
                  <label htmlFor="sample-picker">Scenario</label>
                  <select
                    id="sample-picker"
                    className="select-full"
                    value={selectedSampleId}
                    onChange={(e) => loadSample(e.target.value)}
                    disabled={busy}
                  >
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

                {selectedSampleId ? (
                  <div className="email-preview">
                    <dl className="email-meta">
                      <div>
                        <dt>From</dt>
                        <dd>{from}</dd>
                      </div>
                      <div>
                        <dt>Subject</dt>
                        <dd>{subject}</dd>
                      </div>
                    </dl>
                    <div className="field">
                      <label htmlFor="sample-body">Message</label>
                      <textarea
                        id="sample-body"
                        rows={5}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                  </div>
                ) : (
                  <Pending>Choose a scenario to load a customer email.</Pending>
                )}
              </>
            ) : (
              <div className="custom-form">
                <div className="custom-guidance">
                  <p className="custom-guidance-title">
                    <span className="custom-guidance-icon" aria-hidden="true">
                      ⚠️
                    </span>
                    Open-ended testing
                  </p>
                  <p>
                    You can write any customer email you like. For the most grounded responses, try a scenario
                    related to our support knowledge base — such as billing, refunds, cancellations, subscriptions,
                    account access, or troubleshooting.
                  </p>
                  <p>
                    The AI will still analyze and respond to other scenarios, but responses may be limited when the
                    knowledge base doesn&apos;t contain relevant information.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="custom-from">
                    Customer name <span className="optional">(optional)</span>
                  </label>
                  <input
                    id="custom-from"
                    type="text"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="Alex Morgan"
                    disabled={busy}
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
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label htmlFor="custom-body">Message</label>
                  <textarea
                    id="custom-body"
                    rows={6}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="I noticed two charges for the same subscription this month. Could you check this and let me know how it will be resolved?"
                    required
                    disabled={busy}
                  />
                </div>
              </div>
            )}

            <div className="ws-actions">
              <button type="button" className="btn btn-primary" onClick={runAnalysis} disabled={busy || !hasInput}>
                {analysisRunning ? "Running analysis…" : "Run AI analysis"}
              </button>
              <button type="button" className="btn" onClick={reset}>
                Reset
              </button>
              {!hasInput && !busy && (
                <span className="ws-hint">
                  {inputMode === "custom" ? "Add a subject and message to continue." : "Choose a scenario to continue."}
                </span>
              )}
            </div>
            {requestChanged && (
              <p className="ws-hint">The request has changed since the last analysis. Run AI analysis again to update the results.</p>
            )}
          </Section>

          {/* 2. AI analysis */}
          <Section id="analysis" step={2} title="AI analysis" description="How the request was classified and how urgently it needs attention.">
            {!hasRun ? (
              <Pending>Category, sentiment, and urgency will appear here after you run the analysis.</Pending>
            ) : (
              <>
                <div className="stat-row">
                  <div className="stat">
                    <span className="stat-label">Category</span>
                    {category ? (
                      <>
                        <span className="stat-value">{category.category}</span>
                        <span className="stat-meta">{Math.round(category.confidence * 100)}% confidence</span>
                      </>
                    ) : (
                      <span className="stat-value stat-placeholder">{categorizeStatus === "running" ? "Analyzing…" : "—"}</span>
                    )}
                  </div>
                  <div className="stat">
                    <span className="stat-label">Sentiment</span>
                    {sentimentResult ? (
                      <>
                        <span className="stat-value">{sentimentResult.sentiment}</span>
                        <span className="stat-meta">{Math.round(sentimentResult.confidence * 100)}% confidence</span>
                      </>
                    ) : (
                      <span className="stat-value stat-placeholder">{sentimentStatus === "running" ? "Analyzing…" : "—"}</span>
                    )}
                  </div>
                  <div className="stat">
                    <span className="stat-label">Urgency</span>
                    {sentimentResult ? (
                      <span className={`stat-value urgency-${sentimentResult.urgency.toLowerCase()}`}>
                        {sentimentResult.urgency}
                      </span>
                    ) : (
                      <span className="stat-value stat-placeholder">{sentimentStatus === "running" ? "Analyzing…" : "—"}</span>
                    )}
                  </div>
                </div>

                {(category || sentimentResult) && (
                  <dl className="notes">
                    {category && (
                      <div>
                        <dt>Why this category</dt>
                        <dd>{category.reason}</dd>
                      </div>
                    )}
                    {sentimentResult && (
                      <div>
                        <dt>Tone and urgency</dt>
                        <dd>{sentimentResult.explanation}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {failure?.stage === "analysis" && (
                  <StageError
                    message={failure.message}
                    action={
                      <button type="button" className="btn btn-small" onClick={runAnalysis} disabled={!hasInput}>
                        Try again
                      </button>
                    }
                  />
                )}
              </>
            )}
          </Section>

          {/* 3. Knowledge used */}
          <Section id="knowledge" step={3} title="Knowledge used" description="Sources retrieved to ground this response.">
            {generateStatus === "running" ? (
              <Loading>Searching the knowledge base and drafting a response…</Loading>
            ) : generateStatus === "done" ? (
              retrievedChunks.length === 0 ? (
                <Pending>No relevant knowledge was found for this request, so the response was drafted from the email alone.</Pending>
              ) : (
                <>
                  <p className="ws-note">
                    {plural(knowledge.sources, "source")} · {plural(knowledge.excerpts, "relevant excerpt")}{" "}
                    {knowledge.excerpts === 1 ? "was" : "were"} provided to the model when drafting the response.
                  </p>
                  <ol className="knowledge-list">
                    {retrievedChunks.map((chunk) => {
                      const { section, preview } = describeChunk(chunk);
                      return (
                        <li className="knowledge-item" key={chunk.id}>
                          <div className="knowledge-item-header">
                            <span className="knowledge-doc">{chunk.title}</span>
                            <span className="knowledge-score">Similarity {chunk.score.toFixed(2)}</span>
                          </div>
                          <div className="knowledge-meta">
                            {section && <span className="knowledge-section">{section}</span>}
                            <code className="knowledge-id">{chunk.id}</code>
                          </div>
                          <p className="knowledge-preview">{preview}</p>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )
            ) : failure?.stage === "knowledge" ? (
              <StageError
                message={failure.message}
                action={
                  <button type="button" className="btn btn-small" onClick={runAnalysis} disabled={!hasInput}>
                    Try again
                  </button>
                }
              />
            ) : generateStatus === "error" ? (
              <Pending>Sources aren&apos;t available because the response couldn&apos;t be drafted.</Pending>
            ) : (
              <Pending>Relevant help-center and policy sources will appear here once the analysis is complete.</Pending>
            )}
          </Section>

          {/* 4. Suggested response */}
          <Section id="response" step={4} title="Suggested response" description="An AI-drafted reply based on the request and the sources above. Review it before sending.">
            {generateStatus === "running" ? (
              <Loading>Drafting a response from the retrieved knowledge…</Loading>
            ) : reply ? (
              <>
                <div className="field">
                  <label htmlFor="reply">Response</label>
                  <textarea id="reply" rows={10} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} />
                </div>
                <div className="ws-actions">
                  <button type="button" className="btn" onClick={copyReply} disabled={!reply.trim()}>
                    {copyState === "copied" ? "Copied" : "Copy response"}
                  </button>
                  {replyEdited && (
                    <button type="button" className="btn btn-primary" onClick={recheckQuality} disabled={busy || !reply.trim()}>
                      Re-check quality
                    </button>
                  )}
                  <span className="ws-hint" aria-live="polite">
                    {copyState === "failed"
                      ? "Couldn't copy automatically — select the text and copy it manually."
                      : replyEdited
                        ? "You've edited the response since its last quality check."
                        : "You can edit the response before copying it."}
                  </span>
                </div>
              </>
            ) : failure?.stage === "response" ? (
              <StageError
                message={failure.message}
                action={
                  <button type="button" className="btn btn-small" onClick={runAnalysis} disabled={!hasInput}>
                    Try again
                  </button>
                }
              />
            ) : retrievalFailed ? (
              <Pending>No response was drafted because knowledge retrieval failed.</Pending>
            ) : (
              <Pending>A suggested response will appear here once relevant knowledge has been retrieved.</Pending>
            )}
          </Section>

          {/* 5. Response quality */}
          <Section id="quality" step={5} title="Response quality" description="An automated review of the response before it goes to the customer.">
            {evaluateStatus === "running" ? (
              <Loading>Reviewing the response…</Loading>
            ) : evaluation ? (
              <>
                {replyEdited && (
                  <p className="ws-stale">
                    This review is for the original draft. Re-check quality to review your edited response.
                  </p>
                )}
                <div className={`verdict verdict-${scoreTone(evaluation.overallScore)}`}>
                  <div className="verdict-score">
                    {formatScore(evaluation.overallScore)}
                    <span> / 10</span>
                  </div>
                  <div className="verdict-text">
                    <span className="verdict-label">{overallLabel(evaluation.overallScore)}</span>
                    <span className="verdict-meta">
                      {evaluation.riskFlags.length === 0
                        ? "No risk flags detected"
                        : `${evaluation.riskFlags.length} risk flag${evaluation.riskFlags.length > 1 ? "s" : ""} — review before sending`}
                    </span>
                  </div>
                </div>

                <div className="dimension-list">
                  {SCORE_DIMENSIONS.map((dimension) => {
                    const score = evaluation.scores[dimension];
                    return (
                      <div className="dimension-row" key={dimension}>
                        <span className="dimension-name">{shortDimensionLabel(DIMENSION_LABELS[dimension])}</span>
                        <span className="dimension-bar" aria-hidden="true">
                          <span
                            className={`dimension-fill fill-${scoreTone(score)}`}
                            style={{ width: `${Math.max(0, Math.min(10, score)) * 10}%` }}
                          />
                        </span>
                        <span className={`dimension-value score-${scoreTone(score)}`}>{score}</span>
                      </div>
                    );
                  })}
                </div>

                <details className="scoring-help">
                  <summary>How scoring works</summary>
                  <div className="scoring-help-body">
                    <p>
                      Each dimension is scored from 1–10. The overall score combines the six dimensions with
                      additional safeguards for weak dimensions and serious risk flags.
                    </p>
                    <dl className="scoring-help-list">
                      {SCORE_DIMENSIONS.map((dimension) => (
                        <div key={dimension}>
                          <dt>{shortDimensionLabel(DIMENSION_LABELS[dimension])}</dt>
                          <dd>{DIMENSION_HELP[dimension]}</dd>
                        </div>
                      ))}
                    </dl>
                    <dl className="scoring-help-list">
                      <div>
                        <dt>Overall score</dt>
                        <dd>
                          25% Relevance · 25% Groundedness · 20% Completeness · 10% Tone · 10% Clarity · 10%
                          Professionalism
                        </dd>
                      </div>
                      <div>
                        <dt>Verdict</dt>
                        <dd>8+ Ready to send · 5–7.9 Needs revision · &lt;5 Do not send as-is</dd>
                      </div>
                      <div>
                        <dt>Safety guardrails</dt>
                        <dd>Critical risk flags cap the score at 4.9. Major risk flags cap it at 6.9.</dd>
                      </div>
                    </dl>
                  </div>
                </details>

                <div className="quality-block">
                  <h3>Risk flags</h3>
                  {evaluation.riskFlags.length === 0 ? (
                    <p className="no-risk-note">No risk flags detected.</p>
                  ) : (
                    evaluation.riskFlags.map((flag, i) => (
                      <div className="risk-flag" key={i}>
                        <strong>{flag.type}</strong>
                        {flag.explanation}
                      </div>
                    ))
                  )}
                </div>

                {evaluation.customerQuestions.length > 0 && (
                  <div className="quality-block">
                    <h3>Customer questions</h3>
                    <ul className="question-list">
                      {evaluation.customerQuestions.map((q, i) => (
                        <li key={i}>
                          <span>{q.question}</span>
                          <span className={`question-status question-${q.status.replace(" ", "-")}`}>{q.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="quality-block">
                  <h3>Review notes</h3>
                  <dl className="notes">
                    <div>
                      <dt>What works</dt>
                      <dd>{evaluation.strengths}</dd>
                    </div>
                    <div>
                      <dt>What to improve</dt>
                      <dd>{evaluation.improvements}</dd>
                    </div>
                    <div>
                      <dt>Most important change</dt>
                      <dd>{evaluation.topSuggestion}</dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : failure?.stage === "quality" ? (
              <StageError
                message={failure.message}
                action={
                  <button type="button" className="btn btn-small" onClick={recheckQuality} disabled={busy || !reply.trim()}>
                    Try again
                  </button>
                }
              />
            ) : (
              <Pending>The response will be scored for tone, relevance, clarity, completeness, professionalism, and groundedness, and checked for risky claims.</Pending>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
