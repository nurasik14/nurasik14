// Small navigation helpers shared by the shell and the portfolio page.
import { PROFILE } from '../config/portfolio.config';

export const BASE = import.meta.env.BASE_URL; // always ends with "/"
export const PAGES = {
  index: { buffer: 'index.md', href: BASE },
  planner: { buffer: 'planner.cal', href: `${BASE}planner/` },
};
export const CV_HREF = `${BASE}${PROFILE.cv}`;

export const pad2 = (k) => String(k).padStart(2, '0');

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Scroll to a section and move keyboard focus there (sections carry tabIndex=-1),
// so the next Tab continues from the section instead of the old position.
export const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (el.hasAttribute('tabindex')) el.focus({ preventScroll: true });
  return true;
};

export const copyText = (text) =>
  navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));

// True when keystrokes belong to a text control rather than to global shortcuts.
const NON_TEXT = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);
export const isTypingTarget = (el) => {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !NON_TEXT.has((el.type || 'text').toLowerCase());
};
