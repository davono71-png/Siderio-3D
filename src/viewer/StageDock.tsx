import { useState } from "react";
import { displayViewName } from "../../shared/view";
import type { AssemblyNode, AssemblyPart, SavedView } from "../../shared/types";
import { Icon } from "../ui/icons";
import { PartTree } from "./PartTree";

export function StageDock({
  root,
  selected,
  views,
  activeView,
  onPickNode,
  onPickView,
}: {
  root: AssemblyNode;
  selected: AssemblyPart[];
  views: SavedView[];
  activeView: string | null;
  onPickNode: (node: AssemblyNode, additive: boolean) => void;
  onPickView: (view: SavedView) => void;
}) {
  const [query, setQuery] = useState("");
  const configs = views.filter((view) => view.kind !== "foto");
  const fotos = views.filter((view) => view.kind === "foto");
  return (
    <div className="stage-dock">
      <div className="dock-main">
        <label className="tree-search-wrap">
          <Icon name="search" />
          <input
            className="tree-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca componente…"
            aria-label="Cerca componente"
          />
        </label>
        <nav className="dock-tree" aria-label="Componenti">
          <PartTree
            root={root}
            query={query}
            selectedIds={selected.map((part) => part.id)}
            selectedNames={selected.map((part) => part.name)}
            onPick={onPickNode}
          />
        </nav>
        {configs.length > 0 && (
          <div className={`dock-col configs ${configs.length > 6 ? "two" : ""}`}>
            <div className="dock-h">Configurazioni</div>
            {configs.map((view) => (
              <button
                key={view.id}
                type="button"
                className={activeView === view.id ? "on" : ""}
                title="Configurazione di visualizzazione"
                onClick={() => onPickView(view)}
              >
                {displayViewName(view.name)}
              </button>
            ))}
          </div>
        )}
      </div>
      {fotos.length > 0 && (
        <div className="dock-col fotos">
          <div className="dock-h">Foto</div>
          {fotos.map((view) => (
            <button
              key={view.id}
              type="button"
              className={activeView === view.id ? "on" : ""}
              title="Punto di vista"
              onClick={() => onPickView(view)}
            >
              {displayViewName(view.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
