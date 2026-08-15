import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatRevision } from "../../shared/slug";
import type { AssemblyPart, SavedView, ViewerPayload } from "../../shared/types";
import { api } from "../api";
import { SiderioEngine } from "../viewer/engine";

export function WorkshopPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const paper = params.get("carta") ?? params.get("paper");
  const vista = params.get("vista");
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SiderioEngine | null>(null);
  const [data, setData] = useState<ViewerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssemblyPart | null>(null);
  const [explode, setExplode] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api
      .viewer(slug, paper)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, paper]);

  useEffect(() => {
    const canvas = host.current?.querySelector("canvas");
    if (!canvas || !data) return;
    const next = new SiderioEngine(canvas);
    next.setMousePreset("siderio");
    next.onSelectionChange = (_id, part) => setSelected(part);
    engine.current = next;
    next.load(data.glbUrl, data.assembly).then(() => {
      const preset = resolveView(data.views, vista);
      if (preset) {
        next.applyViewPreset(preset.isolatePartIds, preset.explode, preset.visibleNames);
        setExplode(preset.explode);
      }
    });
    return () => {
      next.dispose();
      engine.current = null;
    };
  }, [data, vista]);

  const onExplode = (value: number) => {
    setExplode(value);
    engine.current?.setExplode(value);
  };

  if (error) {
    return (
      <div className="workshop-shell workshop-error">
        <p>{error}</p>
        <Link to="/">Torna alle commesse</Link>
      </div>
    );
  }

  return (
    <div className="workshop-shell">
      <header className="workshop-top">
        <div>
          <div className="workshop-job">{data?.project.jobCode ?? slug}</div>
          <div className="workshop-meta">
            {data?.project.clientName} · {data?.project.title}
          </div>
        </div>
        <div className="workshop-rev">
          <span>REVISIONE</span>
          <strong>{data ? formatRevision(data.revision.revision) : "--"}</strong>
        </div>
      </header>

      {data?.paperWarning && (
        <div className="paper-warning" role="alert">
          Il disegno cartaceo che stai utilizzando è REV.{formatRevision(data.paperWarning.paper)}. La
          revisione corrente è REV.{formatRevision(data.paperWarning.current)}.
        </div>
      )}

      <div className="workshop-stage" ref={host}>
        <canvas />
        {busy && <div className="overlay-msg">Apertura modello…</div>}
        {selected && <div className="pick-label">{selected.name}</div>}
      </div>

      {data && data.views.length > 0 && (
        <div className="workshop-views">
          {data.views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => {
                engine.current?.applyViewPreset(view.isolatePartIds, view.explode, view.visibleNames);
                setExplode(view.explode);
                setSelected(null);
              }}
            >
              {view.name}
            </button>
          ))}
        </div>
      )}

      <footer className="workshop-bar">
        <button type="button" onClick={() => engine.current?.isolate()} disabled={!selected}>
          Isola
        </button>
        <button type="button" onClick={() => engine.current?.hideSelected()} disabled={!selected}>
          Nascondi
        </button>
        <button
          type="button"
          onClick={() => {
            engine.current?.showAll();
            setSelected(null);
            setExplode(0);
          }}
        >
          Tutto
        </button>
        <button type="button" onClick={() => engine.current?.fit(Boolean(selected))}>
          Centra
        </button>
        <label className="explode-ctrl">
          Esploso
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explode}
            onChange={(event) => onExplode(Number(event.target.value))}
          />
        </label>
      </footer>
    </div>
  );
}

function resolveView(views: SavedView[], name: string | null): SavedView | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  return views.find((view) => view.kind === key || view.name.toLowerCase() === key);
}
