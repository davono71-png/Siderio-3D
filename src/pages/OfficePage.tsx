import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatRevision } from "../../shared/slug";
import { configNameError } from "../../shared/view";
import type { AssemblyPart, SavedView, ViewerPayload } from "../../shared/types";
import type { MaterialId } from "../../shared/material";
import { api } from "../api";
import { Icon } from "../ui/icons";
import { SiderioEngine, type PartMeasure, type SectionPhase, type StandardView } from "../viewer/engine";
import { PhotoSave } from "../viewer/PhotoSave";
import { SelectionCard } from "../viewer/SelectionCard";
import { StageDock } from "../viewer/StageDock";

const VIEWS: { id: StandardView; label: string }[] = [
  { id: "iso", label: "Isometrica" },
  { id: "front", label: "Fronte" },
  { id: "top", label: "Alto" },
  { id: "right", label: "Destra" },
  { id: "left", label: "Sinistra" },
  { id: "back", label: "Retro" },
];

export function OfficePage() {
  const { slug = "" } = useParams();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<SiderioEngine | null>(null);
  const [data, setData] = useState<ViewerPayload | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssemblyPart[]>([]);
  const [measure, setMeasure] = useState<PartMeasure | null>(null);
  const [explode, setExplode] = useState(0);
  const [tab, setTab] = useState<"file" | "vista" | "visualizza" | "esploso">("vista");
  const [zoomOn, setZoomOn] = useState(false);
  const [sectionPhase, setSectionPhase] = useState<SectionPhase>("off");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [configName, setConfigName] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .viewer(slug)
      .then((payload) => {
        setData(payload);
        setViews(payload.views);
      })
      .catch((err: Error) => setError(err.message));
  }, [slug]);

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
    void next.load(data.glbUrl, data.assembly);
    return () => {
      next.dispose();
      engine.current = null;
    };
  }, [data]);

  const hasSel = selected.length > 0;
  const sectionHint =
    sectionPhase === "pickFace"
      ? "Sezione: clicca una faccia del pezzo"
      : sectionPhase === "dragPlane"
        ? "Sposta il piano parallelo, poi clicca per fissarlo"
        : sectionPhase === "pickSide"
          ? "Sposta il mouse: la freccia gira davanti o dietro. Clicca per tenere quel lato"
          : null;

  const applySaved = (view: SavedView) => {
    const target = engine.current;
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

  const saveConfig = async () => {
    const nameIssue = configNameError(configName);
    if (nameIssue) {
      setSaveMsg(nameIssue);
      return;
    }
    const preset = engine.current?.captureDisplayConfig();
    if (!preset) {
      setSaveMsg("Apri prima il modello.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const { view } = await api.saveView(slug, { name: configName.trim(), ...preset });
      setViews((current) => [...current, view]);
      setActiveView(view.id);
      setConfigName("");
      setSaveMsg(`Salvata «${view.name}»: visibile anche in officina.`);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
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
      setSaveMsg(`Foto «${view.name}» salvata: visibile anche in officina.`);
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

  if (error) {
    return (
      <div className="office-shell pad">
        <p>{error}</p>
        <Link to="/">Commesse</Link>
      </div>
    );
  }

  return (
    <div className="office-shell">
      <header className="office-titlebar">
        <div className="brand-mark sm">S</div>
        <strong>Siderio 3D</strong>
        <span>
          {data?.project.jobCode} — {data?.project.clientName} — {data?.project.title}
        </span>
        <b>REV.{data ? formatRevision(data.revision.revision) : "--"}</b>
        <Link to={`/c/${slug}`}>Officina</Link>
        <Link to="/">Commesse</Link>
      </header>

      <nav className="office-tabs">
        {(["file", "vista", "visualizza", "esploso"] as const).map((id) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {id === "file" ? "File" : id === "vista" ? "Vista" : id === "visualizza" ? "Visualizza" : "Esploso"}
          </button>
        ))}
      </nav>

      <div className="office-ribbon">
        {tab === "file" && (
          <>
            <Link className="rib-btn" to="/">
              <Icon name="home" />
              Commesse
            </Link>
            <Link className="rib-btn" to={`/c/${slug}`}>
              <Icon name="box" />
              Apri officina
            </Link>
          </>
        )}
        {tab === "vista" && (
          <>
            {VIEWS.map((view) => (
              <button key={view.id} type="button" className="rib-btn" onClick={() => engine.current?.setView(view.id)}>
                {view.label}
              </button>
            ))}
            <button type="button" className="rib-btn" onClick={() => engine.current?.fit(hasSel)}>
              <Icon name="center" />
              Adatta
            </button>
            <label className="save-config ribbon">
              <input
                value={configName}
                onChange={(event) => setConfigName(event.target.value)}
                placeholder="Nome configurazione"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveConfig();
                }}
              />
              <button type="button" className="rib-btn primary" disabled={saving} onClick={() => void saveConfig()}>
                <Icon name="save" />
                Salva configurazione
              </button>
            </label>
            <PhotoSave className="ribbon" saving={saving} onSave={saveFoto} />
          </>
        )}
        {tab === "visualizza" && (
          <>
            <button type="button" className="rib-btn" onClick={() => engine.current?.hideSelected()} disabled={!hasSel}>
              <Icon name="eye-off" />
              Nascondi
            </button>
            <button type="button" className="rib-btn" onClick={() => engine.current?.isolate()} disabled={!hasSel}>
              <Icon name="isolate" />
              Mostra solo
            </button>
            <button
              type="button"
              className="rib-btn"
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
              className={`rib-btn ${zoomOn ? "on" : ""}`}
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
              className={`rib-btn ${sectionPhase !== "off" ? "on" : ""}`}
              onClick={() => engine.current?.toggleSection()}
            >
              <Icon name="section" />
              {sectionPhase === "clipped" ? "Togli sezione" : "Sezione"}
            </button>
            <button type="button" className="rib-btn" onClick={() => engine.current?.fit(hasSel)}>
              <Icon name="center" />
              Centra
            </button>
          </>
        )}
        {tab === "esploso" && (
          <label className="explode-ctrl office">
            Fattore esploso
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={explode}
              onChange={(event) => {
                const value = Number(event.target.value);
                setExplode(value);
                engine.current?.setExplode(value);
              }}
            />
          </label>
        )}
        {saveMsg && <span className="save-msg">{saveMsg}</span>}
      </div>

      <div className="office-body">
        <div className="office-stage" ref={host}>
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
          {sectionHint && <div className="section-hint">{sectionHint}</div>}
        </div>
        <aside className="office-props">
          <h2>Proprietà</h2>
          {selected[0] ? (
            <>
              <SelectionCard measure={measure} onMaterial={assignMaterial} />
              <div className="prop-actions">
                <button type="button" onClick={() => engine.current?.isolate()}>
                  <Icon name="isolate" />
                  Mostra solo
                </button>
                <button type="button" onClick={() => engine.current?.hideSelected()}>
                  <Icon name="eye-off" />
                  Nascondi
                </button>
                <button type="button" onClick={() => engine.current?.fit(true)}>
                  <Icon name="center" />
                  Centra
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Seleziona un particolare nel modello o nell&apos;albero.</p>
          )}
        </aside>
      </div>

      <footer className="workshop-bar office-bar">
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
        <label className="explode-ctrl">
          Esploso
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explode}
            onChange={(event) => {
              const value = Number(event.target.value);
              setExplode(value);
              engine.current?.setExplode(value);
            }}
          />
        </label>
        <label className="save-config">
          <input
            value={configName}
            onChange={(event) => setConfigName(event.target.value)}
            placeholder="Nome configurazione"
            onKeyDown={(event) => {
              if (event.key === "Enter") void saveConfig();
            }}
          />
          <button type="button" className="primary" disabled={saving} onClick={() => void saveConfig()}>
            <Icon name="save" />
            Salva configurazione
          </button>
        </label>
        <PhotoSave saving={saving} onSave={saveFoto} />
      </footer>
    </div>
  );
}
