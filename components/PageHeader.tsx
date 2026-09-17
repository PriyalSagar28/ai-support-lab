type Props = {
  phase: string;
  title: string;
  description: string;
};

export default function PageHeader({ phase, title, description }: Props) {
  return (
    <header className="page-header">
      <span className="badge badge-mock">{phase} · Mock demo</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
