import path from "node:path";
import { tmpdir } from "node:os";

/** Vercel's deployed source directory is read-only; cache files belong in /tmp. */
export function dataDirectory(): string {
  return process.env.DATA_DIR || (process.env.VERCEL ? path.join(tmpdir(), "aqua") : path.join(process.cwd(), "data"));
}
