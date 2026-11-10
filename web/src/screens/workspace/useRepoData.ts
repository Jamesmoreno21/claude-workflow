import { useEffect, useState } from "react";
import type { FileContents, RepoTree } from "../../../../shared/protocol";
import { getFile, getRepoTree } from "../../services/files";

type Loaded<T> = { data: T | null; error: string | null };

/** Fetches whenever `key` changes; `version` refetches the same thing (after writes). */
function useFetched<T>(key: string | null, version: number, load: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<Loaded<T> & { key: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!key) return;
    let current = true;
    load().then(
      (data) => current && setResult({ key, data, error: null }),
      (err: Error) => current && setResult({ key, data: null, error: err.message }),
    );
    return () => {
      current = false;
    };
    // `load` closes over the same inputs as `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return result.key === key ? result : { data: null, error: null };
}

export const useRepoTree = (repo: string | null, version: number) => useFetched<RepoTree>(repo, version, () => getRepoTree(repo!));

export const useRepoFile = (repo: string | null, path: string | null, version: number) =>
  useFetched<FileContents>(repo && path ? `${repo}:${path}` : null, version, () => getFile(repo!, path!));
