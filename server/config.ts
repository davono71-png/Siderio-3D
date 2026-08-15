import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolvePath(value: string): string {
  return isAbsolute(value) ? value : join(root, value);
}

export const ROOT_DIR = root;
export const PORT = Number(process.env.PORT ?? 3000);
export const DATA_DIR = resolvePath(process.env.DATA_DIR ?? "data");
export const DB_PATH = join(DATA_DIR, "siderio.db");
export const STORAGE_DIR = join(DATA_DIR, "storage");
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
export const IS_PROD = process.env.NODE_ENV === "production" || process.env.SIDERIO_SERVE_WEB === "1";

mkdirSync(STORAGE_DIR, { recursive: true });
