import Link from "next/link";

export default function PipelineCallout() {
  return (
    <div className="pipeline-callout">
      <span>See this step as part of the full end-to-end workflow.</span>
      <Link href="/pipeline" className="btn btn-primary">
        Try the full pipeline →
      </Link>
    </div>
  );
}
