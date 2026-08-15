import type { CreateProjectInput, Project, ProjectDetail, SavedView, SolidEdgeManifest, ViewerPayload } from "../shared/types";

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function json<T>(responsePromise: Promise<Response>): Promise<T> {
  const response = await responsePromise;
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

export const api = {
  projects: () => json<{ projects: Project[] }>(fetch("/api/projects")),
  project: (slug: string) => json<ProjectDetail>(fetch(`/api/projects/${slug}`)),
  viewer: (slug: string, paper?: string | null) => {
    const query = paper ? `?carta=${encodeURIComponent(paper)}` : "";
    return json<ViewerPayload>(fetch(`/api/projects/${slug}/viewer${query}`));
  },
  qr: (slug: string) => json<{ url: string; svg: string; label: string }>(fetch(`/api/projects/${slug}/qr`)),
  createProject: (input: CreateProjectInput) =>
    json<{ project: Project }>(
      fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ),
  publish: (slug: string, revisionId: string) =>
    json<{ ok: boolean }>(fetch(`/api/projects/${slug}/revisions/${revisionId}/publish`, { method: "POST" })),
  uploadRevision: async (slug: string, file: File, notes: string, publish: boolean) => {
    const body = new FormData();
    body.append("file", file);
    body.append("notes", notes);
    body.append("publish", publish ? "1" : "0");
    return json<{ revision: { id: string } }>(
      fetch(`/api/projects/${slug}/revisions`, { method: "POST", body }),
    );
  },
  openPackage: async (manifest: SolidEdgeManifest, step: File) => {
    const body = new FormData();
    body.append("manifest", JSON.stringify(manifest));
    body.append("step", step, step.name);
    return json<{ project: Project; viewerUrl: string }>(fetch("/api/publish", { method: "POST", body }));
  },
  saveView: (
    slug: string,
    input: {
      name: string;
      kind?: "configurazione" | "foto";
      visibleNames?: string[];
      explode?: number;
      camera?: SavedView["camera"];
    },
  ) =>
    json<{ view: SavedView }>(
      fetch(`/api/projects/${slug}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    ),
  savePartMaterials: (slug: string, assignments: Array<{ partId: string; materialId: string }>) =>
    json<{ ok: boolean }>(
      fetch(`/api/projects/${slug}/materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      }),
    ),
};
