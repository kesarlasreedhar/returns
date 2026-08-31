type Props = {
  label: string;
  value: string | number;
};

export function StatCard({ label, value }: Props): JSX.Element {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
