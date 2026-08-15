import { useLayoutEffect, useState } from "react";
import { componentTree, nodeMatches } from "../../shared/tree";
import type { AssemblyNode } from "../../shared/types";

export function PartTree({
  root,
  selectedIds,
  selectedNames,
  query = "",
  onPick,
}: {
  root: AssemblyNode;
  selectedIds: string[];
  selectedNames: string[];
  query?: string;
  onPick: (node: AssemblyNode, additive: boolean) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const selectedKey = `${selectedIds.join("\0")}\n${selectedNames.join("\0")}`;
  const filtering = query.trim().length > 0;
  const isOpen = (id: string) => filtering || open[id] !== false;
  const toggle = (id: string) => setOpen((current) => ({ ...current, [id]: current[id] === false }));

  useLayoutEffect(() => {
    if (selectedIds.length !== 1 && selectedNames.length !== 1) return;
    const expand = ancestorIdsToSelection(componentTree(root), selectedIds, selectedNames);
    if (expand.length) {
      setOpen((current) => {
        let changed = false;
        const next = { ...current };
        for (const id of expand) {
          if (next[id] === false) {
            next[id] = true;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }
    const scroll = () => {
      document.querySelector<HTMLElement>("[data-tree-hit='1']")?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(scroll));
  }, [root, selectedKey]);

  return (
    <>
      {componentTree(root)
        .filter((node) => nodeMatches(node, query))
        .map((node) => (
          <PartRow
            key={node.id}
            node={node}
            depth={0}
            query={query}
            selectedIds={selectedIds}
            selectedNames={selectedNames}
            open={isOpen}
            onToggle={toggle}
            onPick={onPick}
          />
        ))}
    </>
  );
}

function namesLooseEqual(a: string, b: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  const stem = (value: string) => value.replace(/\.(par|asm|psm):\d+$/i, "");
  return na === nb || stem(na) === stem(nb) || na.includes(nb) || nb.includes(na);
}

function isExact(node: AssemblyNode, selectedIds: string[], selectedNames: string[]): boolean {
  if (node.partId != null && selectedIds.length === 1 && selectedIds.includes(node.partId)) return true;
  if (selectedNames.length !== 1 || !namesLooseEqual(node.name, selectedNames[0] ?? "")) return false;
  return !node.children.some(
    (child) =>
      namesLooseEqual(child.name, selectedNames[0] ?? "") ||
      (child.partId != null && selectedIds.includes(child.partId)),
  );
}

function ancestorIdsToSelection(nodes: AssemblyNode[], selectedIds: string[], selectedNames: string[]): string[] {
  const ids: string[] = [];
  const visit = (node: AssemblyNode): boolean => {
    const self = isExact(node, selectedIds, selectedNames);
    const childHit = node.children.some((child) => visit(child));
    if (childHit) ids.push(node.id);
    return self || childHit;
  };
  for (const node of nodes) visit(node);
  return ids;
}

function nodeActive(node: AssemblyNode, selectedIds: string[], selectedNames: string[]): boolean {
  if (node.partId != null && selectedIds.includes(node.partId)) return true;
  if (selectedNames.some((name) => namesLooseEqual(name, node.name))) return true;
  return node.children.some((child) => nodeActive(child, selectedIds, selectedNames));
}

function PartRow({
  node,
  depth,
  query,
  selectedIds,
  selectedNames,
  open,
  onToggle,
  onPick,
}: {
  node: AssemblyNode;
  depth: number;
  query: string;
  selectedIds: string[];
  selectedNames: string[];
  open: (id: string) => boolean;
  onToggle: (id: string) => void;
  onPick: (node: AssemblyNode, additive: boolean) => void;
}) {
  const visibleKids = node.children.filter((child) => nodeMatches(child, query));
  const hasKids = visibleKids.length > 0;
  const expanded = !hasKids || open(node.id);
  const active = nodeActive(node, selectedIds, selectedNames);
  const exact = isExact(node, selectedIds, selectedNames);
  return (
    <>
      <div className="tree-row" style={{ paddingLeft: `${6 + depth * 14}px` }}>
        {hasKids ? (
          <button
            type="button"
            className="twist"
            aria-label={expanded ? "Comprimi" : "Espandi"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="twist-sp" />
        )}
        <button
          type="button"
          data-tree-hit={exact ? "1" : undefined}
          className={`${active ? "on" : ""} ${node.children.length ? "group" : ""}`}
          onClick={(event) => onPick(node, event.ctrlKey || event.metaKey)}
        >
          {node.name}
        </button>
      </div>
      {hasKids &&
        expanded &&
        visibleKids.map((child) => (
          <PartRow
            key={child.id}
            node={child}
            depth={depth + 1}
            query={query}
            selectedIds={selectedIds}
            selectedNames={selectedNames}
            open={open}
            onToggle={onToggle}
            onPick={onPick}
          />
        ))}
    </>
  );
}
