import { PAGES } from "@/lib/pages";
import { PageHeader } from "@/components/page-header";

export default function Overview() {
  return (
    <>
      <PageHeader
        title="Warehouse"
        description="Consignment, purchase orders, BOC stock and the specialty CL monthly report."
      />
      <div className="tiles">
        {PAGES.map(p => (
          <a className="dept" href={p.href} key={p.href}>
            <div className="dept-top">
              <h2>{p.title}</h2>
              <span className={`pill ${p.status === "ready" ? "live" : "queued"}`}>
                <span className="dot" />
                {p.status === "ready" ? "Ready" : "Awaiting data"}
              </span>
            </div>
            <p className="desc">{p.description}</p>
            <div className="host"><span className="arrow">→</span>{p.short}</div>
          </a>
        ))}
      </div>
    </>
  );
}
