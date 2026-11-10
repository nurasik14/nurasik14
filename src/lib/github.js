/* public/data/github.json, fetched once at runtime and shared by the sidebar
 * (followers/stars line) and the contribution graph. Written by
 * scripts/profile_stats.py. On failure the page shows an error state, never
 * stand-in numbers. */
import { useEffect, useState } from 'react';
import { isGithubData } from './contrib';

export const GITHUB_FILE = 'data/github.json';
export const GITHUB_JSON = `${import.meta.env.BASE_URL ?? '/'}${GITHUB_FILE}`;

let pending = null;

export function loadGithub(fetchImpl = globalThis.fetch) {
  pending ??= fetchImpl(GITHUB_JSON)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((d) => {
      if (!isGithubData(d)) throw new Error('unexpected format');
      return d;
    })
    .catch((e) => {
      pending = null; // a later mount may retry
      throw e;
    });
  return pending;
}

/** { status: 'loading' | 'ready' | 'error', data, error } */
export function useGithub() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  useEffect(() => {
    let live = true;
    loadGithub().then(
      (data) => live && setState({ status: 'ready', data, error: null }),
      (error) => live && setState({ status: 'error', data: null, error: String(error?.message ?? error) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
