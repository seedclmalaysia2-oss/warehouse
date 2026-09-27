// Placeholder body for a page whose data source hasn't been confirmed yet.
// Lists what the page will show and what it needs, so nobody mistakes an
// empty page for a page with no data.
export function AwaitingSource({ sections, needs }: {
  sections: { title: string; detail: string }[];
  needs: string[];
}) {
  return (
    <>
      <div className="grid">
        {sections.map(s => (
          <section className="panel planned" key={s.title}>
            <h2>{s.title}</h2>
            <p className="desc">{s.detail}</p>
          </section>
        ))}
      </div>
      <section className="needs">
        <span className="label">Needed to wire this page</span>
        <ul>{needs.map(n => <li key={n}>{n}</li>)}</ul>
      </section>
    </>
  );
}
