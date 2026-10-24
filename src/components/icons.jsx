// Lucide icons (ISC licence) inlined so the site needs no icon package.
const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const Wrench = (p) => (
  <svg {...base} {...p}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export const Check = (p) => (
  <svg {...base} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ChevronRight = (p) => (
  <svg {...base} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const LoaderCircle = (p) => (
  <svg {...base} {...p}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const Archive = (p) => (
  <svg {...base} {...p}>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </svg>
);
