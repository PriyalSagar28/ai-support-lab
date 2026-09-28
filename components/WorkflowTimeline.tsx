"use client";

import { useEffect, useRef } from "react";

export type StageState = "upcoming" | "active" | "done" | "error";

export type WorkflowStage = {
  id: string;
  label: string;
  shortLabel: string;
  state: StageState;
  // True only while a request for this stage is actually in flight.
  running: boolean;
  caption: string;
};

type Props = {
  stages: WorkflowStage[];
  viewing: string;
  summary: string;
  onSelect: (id: string) => void;
};

function StageIcon({ state, running }: { state: StageState; running: boolean }) {
  const classes = ["wf-icon", `wf-icon-${state}`];
  if (running) classes.push("wf-icon-running");
  return (
    <span className={classes.join(" ")} aria-hidden="true">
      {state === "done" && (
        <svg viewBox="0 0 16 16" width="10" height="10">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "error" && "!"}
    </span>
  );
}

const STATE_TEXT: Record<StageState, string> = {
  upcoming: "Not started",
  active: "In progress",
  done: "Complete",
  error: "Failed",
};

export default function WorkflowTimeline({ stages, viewing, summary, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  // In the compact (mobile) bar the stages can overflow sideways; keep the
  // stage being read in view. Only the bar scrolls — never the page — and
  // on desktop the list doesn't overflow, so this is a no-op.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const item = list.querySelector<HTMLElement>(".wf-item-viewing");
    if (!item) return;
    const padding = 16;
    let left = list.scrollLeft;
    if (item.offsetLeft - padding < list.scrollLeft) left = item.offsetLeft - padding;
    else if (item.offsetLeft + item.offsetWidth + padding > list.scrollLeft + list.clientWidth)
      left = item.offsetLeft + item.offsetWidth + padding - list.clientWidth;
    if (left === list.scrollLeft) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
  }, [viewing]);

  return (
    <nav className="workflow" aria-label="AI workflow">
      <div className="workflow-header">
        <h2 className="workflow-title">AI workflow</h2>
        <p className="workflow-summary" aria-live="polite">
          {summary}
        </p>
      </div>
      <ol className="workflow-list" ref={listRef}>
        {stages.map((stage) => {
          const classes = ["wf-item", `wf-item-${stage.state}`];
          if (stage.id === viewing) classes.push("wf-item-viewing");
          return (
            <li key={stage.id} className={classes.join(" ")}>
              <button
                type="button"
                className="wf-button"
                onClick={() => onSelect(stage.id)}
                aria-current={stage.id === viewing ? "location" : undefined}
              >
                <StageIcon state={stage.state} running={stage.running} />
                <span className="wf-text">
                  <span className="wf-label wf-label-full">{stage.label}</span>
                  <span className="wf-label wf-label-short">{stage.shortLabel}</span>
                  <span className="wf-caption">{stage.caption}</span>
                  <span className="sr-only">
                    {" "}
                    ({stage.running ? "Running" : STATE_TEXT[stage.state]})
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
