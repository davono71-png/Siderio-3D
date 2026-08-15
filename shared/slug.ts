/** Normalizza una commessa tipo "26/0147" nell'identificativo URL "26-0147". */
export function jobToSlug(job: string): string {
  return job
    .trim()
    .replace(/\s+/g, "")
    .replace(/\//g, "-")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function slugToJob(slug: string): string {
  const cleaned = slug.trim().replace(/-/g, "/");
  return cleaned.toUpperCase() === cleaned ? cleaned : slug.trim().replace(/-/g, "/");
}

export function parseRevisionLabel(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const match = String(value).match(/(\d+)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function paperRevisionWarning(
  paperRevision: number | null,
  currentRevision: number,
): { paper: number; current: number } | null {
  if (paperRevision == null) return null;
  if (paperRevision === currentRevision) return null;
  return { paper: paperRevision, current: currentRevision };
}

export function formatRevision(revision: number): string {
  return String(revision).padStart(2, "0");
}
