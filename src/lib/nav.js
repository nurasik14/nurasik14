import { PROFILE } from '../config/portfolio.config';

export const SECTIONS = [
  { id: 'projects', label: 'projects', key: '1' },
  { id: 'experience', label: 'experience', key: '2' },
  { id: 'awards', label: 'awards', key: '3' },
  { id: 'contact', label: 'contact', key: '4' },
];

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const scrollToId = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });

export const copyEmail = () => navigator.clipboard.writeText(PROFILE.email);
