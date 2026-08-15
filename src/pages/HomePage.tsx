import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { findPackageParts } from "../../shared/package";
import { parseSolidEdgeManifest } from "../../shared/manifest";
import { formatRevision } from "../../shared/slug";
import type { Project, ProjectDetail } from "../../shared/types";
import { api } from "../api";
import { Icon } from "../ui/icons";

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
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.createProject({
        jobCode: String(form.get("jobCode") ?? ""),
        clientName: String(form.get("clientName") ?? ""),
        title: String(form.get("title") ?? ""),
      });
      formEl.reset();
      await refresh(project.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  };

  const onOpenPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    const names = files.map((file) => file.webkitRelativePath || file.name);
    const found = findPackageParts(names);
    if (!found) {
      setError("Nella cartella servono siderio.json e lo STEP (model.stp). Esporta prima da Solid Edge.");
      return;
    }
    const manifestFile = files[names.indexOf(found.manifest)];
    const stepFile = files[names.indexOf(found.step)];
    if (!manifestFile || !stepFile) {
      setError("Non riesco a leggere i file del pacchetto.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const manifest = parseSolidEdgeManifest(JSON.parse(await manifestFile.text()));
      const { project } = await api.openPackage(manifest, stepFile);
      await refresh(project.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pacchetto non aperto");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Scegli un file STEP.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.uploadRevision(selected.project.slug, file, String(form.get("notes") ?? ""), true);
      formEl.reset();
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
        <div className="home-brand">
          <div className="brand-mark">S</div>
          <div>
            <p className="eyebrow">Siderio Suite</p>
            <h1>Modelli 3D</h1>
          </div>
        </div>
        <p className="lede">
          In Solid Edge si esporta una cartella. Da qui si apre quel pacchetto: geometria, albero e configurazioni
          di visualizzazione.
        </p>
      </header>

      {error && <div className="banner err">{error}</div>}
      {busy && <div className="banner">Elaborazione in corso. Il browser dell&apos;officina non legge lo STEP.</div>}

      <div className="home-grid">
        <section className="panel">
          <h2>Commesse</h2>
          <label className="package-open">
            <h3>Apri pacchetto</h3>
            <span className="package-btn">
              <Icon name="folder" />
              {busy ? "Apertura…" : "Scegli la cartella copiata"}
            </span>
            <input
              type="file"
              disabled={busy}
              multiple
              onChange={(event) => void onOpenPackage(event)}
              ref={(el) => {
                if (!el) return;
                el.setAttribute("webkitdirectory", "");
                el.setAttribute("directory", "");
              }}
            />
            <p className="hint">
              Deve contenere <b>siderio.json</b> e <b>model.stp</b>. Poi apri Officina.
            </p>
          </label>
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
            <button type="submit" className="primary" disabled={busy}>
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
                  <Icon name="box" />
                  Apri officina
                </Link>
                <Link className="big ghost" to={`/office/${selected.project.slug}`}>
                  <Icon name="home" />
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
                <button type="submit" className="primary" disabled={busy}>
                  Converti e pubblica
                </button>
                <p className="hint">
                  Riserva: STEP senza configurazioni Solid Edge. Il flusso giusto è esportare la cartella dal
                  pubblicatore sulla workstation, poi <b>Apri pacchetto</b>.
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
