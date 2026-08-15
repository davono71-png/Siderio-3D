import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatRevision } from "../../shared/slug";
import type { AssemblyNode, AssemblyPart, ViewerPayload } from "../../shared/types";
import { api } from "../api";
import { SiderioEngine, type MousePreset, type StandardView } from "../viewer/engine";

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
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssemblyPart | null>(null);
  const [explode, setExplode] = useState(0);
  const [mouse, setMouse] = useState<MousePreset>("cad");
  const [tab, setTab] = useState<"file" | "vista" | "visualizza" | "esploso">("vista");

  useEffect(() => {
    api
      .viewer(slug)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    const canvas = host.current?.querySelector("canvas");
    if (!canvas || !data) return;
    const next = new SiderioEngine(canvas);
    next.setMousePreset("cad");
    next.onSelectionChange = (_id, part) => setSelected(part);
    engine.current = next;
    void next.load(data.glbUrl, data.assembly);
    return () => {
      next.dispose();
      engine.current = null;
    };
  }, [data]);

  const selectedNode = useMemo(
    () => (data && selected ? findNode(data.assembly.root, selected.id) : null),
    [data, selected],
  );

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
              Commesse
            </Link>
            <Link className="rib-btn" to={`/c/${slug}`}>
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
            <button type="button" className="rib-btn" onClick={() => engine.current?.fit(Boolean(selected))}>
              Adatta
            </button>
          </>
        )}
        {tab === "visualizza" && (
          <>
            <button type="button" className="rib-btn" onClick={() => engine.current?.isolate()} disabled={!selected}>
              Isola
            </button>
            <button type="button" className="rib-btn" onClick={() => engine.current?.hideSelected()} disabled={!selected}>
              Nascondi
            </button>
            <button
              type="button"
              className="rib-btn"
              onClick={() => {
                engine.current?.showAll();
                setSelected(null);
                setExplode(0);
              }}
            >
              Mostra tutto
            </button>
            <label className="rib-check">
              Mouse
              <select
                value={mouse}
                onChange={(event) => {
                  const value = event.target.value as MousePreset;
                  setMouse(value);
                  engine.current?.setMousePreset(value);
                }}
              >
                <option value="cad">CAD classico (tasto centrale ruota)</option>
                <option value="siderio">Siderio (sinistro ruota)</option>
              </select>
            </label>
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
      </div>

      <div className="office-body">
        <aside className="office-tree">
          <h2>Assieme</h2>
          {data && (
            <Tree
              node={data.assembly.root}
              selectedId={selected?.id ?? null}
              onSelect={(id) => engine.current?.select(id)}
            />
          )}
        </aside>
        <div className="office-stage" ref={host}>
          <canvas />
        </div>
        <aside className="office-props">
          <h2>Proprietà</h2>
          {selected ? (
            <>
              <Row label="Nome" value={selected.name} />
              <Row label="ID" value={selected.id} />
              <Row label="Tipo" value={selectedNode?.children.length ? "Gruppo" : "Parte"} />
              <Row label="Triangoli" value={String(selected.triangleCount)} />
              <div className="prop-actions">
                <button type="button" onClick={() => engine.current?.isolate()}>
                  Isola
                </button>
                <button type="button" onClick={() => engine.current?.hideSelected()}>
                  Nascondi
                </button>
                <button type="button" onClick={() => engine.current?.fit(true)}>
                  Centra
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Seleziona un particolare nel modello o nell&apos;albero.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="prop-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Tree({
  node,
  selectedId,
  onSelect,
}: {
  node: AssemblyNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selectable = node.partId ?? node.id;
  const active = node.partId != null && node.partId === selectedId;
  return (
    <div className="tree-node">
      <button type="button" className={active ? "on" : ""} onClick={() => node.partId && onSelect(node.partId)}>
        {node.name}
      </button>
      {node.children.map((child) => (
        <Tree key={child.id + selectable} node={child} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function findNode(node: AssemblyNode, partId: string): AssemblyNode | null {
  if (node.partId === partId) return node;
  for (const child of node.children) {
    const found = findNode(child, partId);
    if (found) return found;
  }
  return null;
}
