import Link from "next/link";

export default function PipelineCallout() {
  return (
    <div className="pipeline-callout">
      <span>See this step as part of the complete support workflow.</span>
      <Link href="/pipeline" className="btn btn-primary">
        Open Support Workspace →
      </Link>
    </div>
  );
}
