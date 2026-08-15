import type { AssemblyNode } from "./types";

/** Ricostruisce i sottoassiemi da id tipo "Anta.asm:1/Telaio.par:1", mantenendo l'ordine. */
export function nestOccurrenceList(nodes: AssemblyNode[]): AssemblyNode[] {
  const copies: AssemblyNode[] = nodes.map((node) => ({
    id: node.id,
    name: node.name,
    partId: node.partId,
    children: node.children.length ? nestOccurrenceList(node.children) : [],
  }));
  if (copies.some((node) => node.children.length > 0)) return copies;

  const byId = new Map(copies.map((node) => [node.id, node]));
  const roots: AssemblyNode[] = [];
  for (const node of copies) {
    const cut = node.id.lastIndexOf("/");
    const parentId = cut === -1 ? "" : node.id.slice(0, cut);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function componentTree(root: AssemblyNode): AssemblyNode[] {
  return nestOccurrenceList(root.children);
}

export function nodeMatches(node: AssemblyNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (node.name.toLowerCase().includes(q)) return true;
  return node.children.some((child) => nodeMatches(child, q));
}
