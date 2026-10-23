import { PageHeader } from "./PageHeader";

export function ComingSoon({
  title,
  subtitle,
  icon,
  planned,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  planned: string[];
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="glass p-6 md:p-8">
        <div
          className="mb-4 grid size-11 place-items-center rounded-2xl"
          style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}
        >
          {icon}
        </div>
        <h2 className="text-lg font-bold">Planned for this screen</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
          {planned.map((p) => (
            <li key={p} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
