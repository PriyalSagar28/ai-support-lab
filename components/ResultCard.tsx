import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

export default function ResultCard({ title, children }: Props) {
  return (
    <div className="card result-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
