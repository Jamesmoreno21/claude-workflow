import { ROUTES } from "../../../shared/constants";
import type { FileContents, RepoTree } from "../../../shared/protocol";

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const getRepoTree = (repo: string) => fetch(`${ROUTES.tree}?${query({ repo })}`).then((r) => json<RepoTree>(r));

export const getFile = (repo: string, path: string) => fetch(`${ROUTES.file}?${query({ repo, path })}`).then((r) => json<FileContents>(r));

export type SaveResult = { ok: true } | { ok: false; conflict: true; working: string } | { ok: false; conflict: false; error: string };

/** Saves an edit; `base` is the text the user started from, so concurrent changes aren't overwritten. */
export async function saveFile(repo: string, path: string, content: string, base: string): Promise<SaveResult> {
  const res = await fetch(ROUTES.file, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, path, content, base }),
  });
  if (res.ok) return { ok: true };
  if (res.status === 409) return { ok: false, conflict: true, working: (await res.json()).working };
  return { ok: false, conflict: false, error: await res.text() };
}
