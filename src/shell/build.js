// Build stamp for the footer. Values are injected at build time through
// VITE_COMMIT (git short sha) and VITE_BUILT_AT (ISO date); without them the
// footer honestly says "dev" instead of inventing a version.
const env = import.meta.env;

export const BUILD = {
  commit: env.VITE_COMMIT || 'dev',
  date: env.VITE_BUILT_AT ? String(env.VITE_BUILT_AT).slice(0, 10) : '',
};
