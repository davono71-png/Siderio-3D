import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatRevision } from "../../shared/slug";
import { configNameError } from "../../shared/view";
import type { AssemblyPart, SavedView, ViewerPayload } from "../../shared/types";
import type { MaterialId } from "../../shared/material";
import { api } from "../api";
import { Icon } from "../ui/icons";
import { SiderioEngine, type PartMeasure, type SectionPhase } from "../viewer/engine";
import { PhotoSave } from "../viewer/PhotoSave";
import { SelectionCard } from "../viewer/SelectionCard";
import { StageDock } from "../viewer/StageDock";

export function WorkshopPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const paper = params.get("carta") ?? params.get("paper");
  const vista = params.get("vista");
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SiderioEngine | null>(null);
  const [data, setData] = useState<ViewerPayload | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssemblyPart[]>([]);
  const [measure, setMeasure] = useState<PartMeasure | null>(null);
  const [activeView, setActiveView] = useState<string | null>(vista);
  const [explode, setExplode] = useState(0);
  const [busy, setBusy] = useState(true);
  const [zoomOn, setZoomOn] = useState(false);
  const [sectionPhase, setSectionPhase] = useState<SectionPhase>("off");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api
      .viewer(slug, paper)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setViews(payload.views);
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
    next.setMousePreset("cad");
    next.onSelectionChange = (_ids, parts) => {
      setSelected(parts);
      setMeasure(next.measureSelection());
    };
    next.onWindowZoomChange = setZoomOn;
    next.onSectionChange = setSectionPhase;
    setSectionPhase("off");
    engine.current = next;
    next.load(data.glbUrl, data.assembly).then(() => {
      const preset = resolveView(data.views, vista);
      if (preset) applySaved(preset, next);
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

  const applySaved = (view: SavedView, target = engine.current) => {
    if (!target) return;
    if (view.kind === "foto" && view.camera) {
      target.applyCamera(view.camera);
    } else {
      target.applyViewPreset(view.isolatePartIds, view.explode, view.visibleNames);
      setExplode(view.explode);
      setSelected([]);
      setMeasure(null);
    }
    setActiveView(view.id);
  };

  const saveFoto = async (name: string) => {
    const nameIssue = configNameError(name);
    if (nameIssue) {
      setSaveMsg(nameIssue);
      return false;
    }
    const camera = engine.current?.captureCamera();
    if (!camera) {
      setSaveMsg("Apri prima il modello.");
      return false;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const { view } = await api.saveView(slug, { name: name.trim(), kind: "foto", camera });
      setViews((current) => [...current, view]);
      setActiveView(view.id);
      setSaveMsg(`Foto «${view.name}» salvata.`);
      return true;
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Salvataggio non riuscito.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const assignMaterial = (materialId: MaterialId) => {
    const ids = engine.current?.getSelectedIds() ?? [];
    if (!ids.length) return;
    engine.current?.setPartsMaterial(ids, materialId);
    setMeasure(engine.current?.measureSelection() ?? null);
    void api.savePartMaterials(
      slug,
      ids.map((partId) => ({ partId, materialId })),
    ).catch((err: Error) => {
      setSaveMsg(err.message);
    });
  };

  const hasSel = selected.length > 0;
  const sectionHint =
    sectionPhase === "pickFace"
      ? "Sezione: clicca una faccia del pezzo"
      : sectionPhase === "dragPlane"
        ? "Sposta il piano parallelo, poi clicca per fissarlo"
        : sectionPhase === "pickSide"
          ? "Sposta il mouse: la freccia gira davanti o dietro. Clicca per tenere quel lato"
          : null;

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
        <div className="brand-mark">S</div>
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
        {data && (
          <StageDock
            root={data.assembly.root}
            selected={selected}
            views={views}
            activeView={activeView}
            onPickNode={(item, additive) => engine.current?.selectTreeNode(item, additive)}
            onPickView={applySaved}
          />
        )}
        {busy && <div className="overlay-msg">Apertura modello…</div>}
        {sectionHint && <div className="section-hint">{sectionHint}</div>}
        <SelectionCard measure={measure} onMaterial={assignMaterial} />
      </div>

      <footer className="workshop-bar">
        <button type="button" onClick={() => engine.current?.hideSelected()} disabled={!hasSel}>
          <Icon name="eye-off" />
          Nascondi
        </button>
        <button type="button" onClick={() => engine.current?.isolate()} disabled={!hasSel}>
          <Icon name="isolate" />
          Mostra solo
        </button>
        <button
          type="button"
          onClick={() => {
            engine.current?.showAll();
            setSelected([]);
            setMeasure(null);
            setExplode(0);
            setActiveView(null);
          }}
        >
          <Icon name="eye" />
          Mostra tutto
        </button>
        <button
          type="button"
          className={zoomOn ? "on" : ""}
          onClick={() => {
            const next = !engine.current?.isWindowZoom();
            engine.current?.setWindowZoom(Boolean(next));
            setZoomOn(Boolean(next));
          }}
        >
          <Icon name="zoom" />
          Zoom finestra
        </button>
        <button
          type="button"
          className={sectionPhase !== "off" ? "on" : ""}
          onClick={() => engine.current?.toggleSection()}
        >
          <Icon name="section" />
          {sectionPhase === "clipped" ? "Togli sezione" : "Sezione"}
        </button>
        <button type="button" onClick={() => engine.current?.fit(hasSel)}>
          <Icon name="center" />
          Centra
        </button>
        <PhotoSave saving={saving} onSave={saveFoto} />
        {saveMsg && <span className="save-msg bar">{saveMsg}</span>}
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
