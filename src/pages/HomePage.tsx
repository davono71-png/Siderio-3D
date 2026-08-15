import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatRevision } from "../../shared/slug";
import type { Project, ProjectDetail } from "../../shared/types";
import { api } from "../api";

export function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<ProjectDetail | null>(null);
  const [qr, setQr] = useState<{ url: string; svg: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async (slug?: string) => {
    const { projects: list } = await api.projects();
    setProjects(list);
    const nextSlug = slug ?? selected?.project.slug ?? list[0]?.slug;
    if (nextSlug) {
      const detail = await api.project(nextSlug);
      setSelected(detail);
      setQr(await api.qr(nextSlug));
    }
  };

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject({
        jobCode: String(form.get("jobCode") ?? ""),
        clientName: String(form.get("clientName") ?? ""),
        title: String(form.get("title") ?? ""),
      });
      event.currentTarget.reset();
      await refresh(project.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Scegli un file STEP.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadRevision(selected.project.slug, file, String(form.get("notes") ?? ""), true);
      event.currentTarget.reset();
      await refresh(selected.project.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore in conversione");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-shell">
      <header className="home-top">
        <div>
          <p className="eyebrow">Siderio</p>
          <h1>Pubblicazione modelli 3D</h1>
        </div>
        <p className="lede">
          Il CAD originale resta sul PC server. In officina si apre solo il modello già convertito, con la
          revisione pubblicata.
        </p>
      </header>

      {error && <div className="banner err">{error}</div>}
      {busy && <div className="banner">Elaborazione in corso. Il browser dell&apos;officina non legge lo STEP.</div>}

      <div className="home-grid">
        <section className="panel">
          <h2>Commesse</h2>
          <ul className="job-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className={selected?.project.id === project.id ? "on" : ""}
                  onClick={() => {
                    void refresh(project.slug);
                  }}
                >
                  <b>{project.jobCode}</b>
                  <span>
                    {project.clientName}
                    <br />
                    {project.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <form className="stack" onSubmit={onCreate}>
            <h3>Nuova commessa</h3>
            <input name="jobCode" placeholder="26/0148" required />
            <input name="clientName" placeholder="Cliente" required />
            <input name="title" placeholder="Titolo modello" required />
            <button type="submit" disabled={busy}>
              Crea
            </button>
          </form>
        </section>

        <section className="panel">
          {selected ? (
            <>
              <h2>
                {selected.project.jobCode} · {selected.project.clientName}
              </h2>
              <p className="muted">{selected.project.title}</p>
              <p className="rev-now">
                Revisione pubblicata:{" "}
                <b>{selected.current ? formatRevision(selected.current.revision) : "nessuna"}</b>
              </p>
              <div className="row-links">
                <Link className="big" to={`/c/${selected.project.slug}`}>
                  Apri officina
                </Link>
                <Link className="big ghost" to={`/office/${selected.project.slug}`}>
                  Apri ufficio
                </Link>
              </div>
              <h3>Revisioni</h3>
              <ul className="rev-list">
                {selected.revisions.map((revision) => (
                  <li key={revision.id}>
                    <span>
                      REV.{formatRevision(revision.revision)}
                      {revision.published ? " · ATTUALE" : revision.superseded ? " · SUPERATA" : ""}
                    </span>
                    {!revision.published && (
                      <button
                        type="button"
                        onClick={() => {
                          void api.publish(selected.project.slug, revision.id).then(() => refresh(selected.project.slug));
                        }}
                      >
                        Pubblica
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <form className="stack" onSubmit={onUpload}>
                <h3>Nuova revisione STEP</h3>
                <input name="file" type="file" accept=".stp,.step,.stpz,.iges,.igs,.brep" />
                <input name="notes" placeholder="Note revisione" />
                <button type="submit" disabled={busy}>
                  Converti e pubblica
                </button>
                <p className="hint">
                  I file .asm di Solid Edge non si aprono qui. Esporta STEP da Solid Edge e carica quello.
                </p>
              </form>
            </>
          ) : (
            <p>Nessuna commessa.</p>
          )}
        </section>

        <section className="panel qr-panel">
          <h2>QR officina</h2>
          {qr ? (
            <>
              <div className="qr-box" dangerouslySetInnerHTML={{ __html: qr.svg }} />
              <p className="mono">{qr.url}</p>
              <p className="muted">
                Il QR resta uguale quando pubblichi una nuova revisione. Eventuale cartaceo superato: aggiungi
                <code> ?carta=03</code> al link stampato sul disegno vecchio.
              </p>
            </>
          ) : (
            <p>Seleziona una commessa.</p>
          )}
        </section>
      </div>
    </div>
  );
}
