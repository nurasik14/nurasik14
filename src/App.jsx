import React from 'react';
import AwardsEducation from './components/AwardsEducation';
import CommandPalette from './components/CommandPalette';
import Contact from './components/Contact';
import Experience from './components/Experience';
import Hero from './components/Hero';
import LogoLoop from './components/LogoLoop';
import Nav from './components/Nav';
import Projects from './components/Projects';
import { PROFILE, TOOLS } from './config/portfolio.config';
import { scrollToId, SECTIONS } from './lib/nav';

const STACK = TOOLS.map(([name, kind]) => ({
  title: name,
  node: (
    <span className="flex items-center gap-2.5 whitespace-nowrap font-mono text-sm text-fg-dim hover:text-neutral-200">
      {name}
      <b className="text-xs font-normal text-neutral-600">{kind}</b>
    </span>
  ),
}));

export default function App() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      const section = SECTIONS.find((s) => s.key === e.key);
      if (section) scrollToId(section.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Nav onOpenPalette={() => setPaletteOpen(true)} />
      <main id="top" className="scroll-mt-16">
        <Hero />
        <div className="border-y border-line bg-black py-4">
          <LogoLoop
            logos={STACK}
            speed={40}
            direction="left"
            logoHeight={22}
            gap={40}
            pauseOnHover
            fadeOut
            fadeOutColor="#000000"
            ariaLabel="Tools I use"
          />
        </div>
        <Projects />
        <Experience />
        <AwardsEducation />
        <Contact />
      </main>
      <footer className="border-t border-line bg-black">
        <div className="wrap flex flex-wrap justify-between gap-2 py-[22px] font-mono text-xs text-fg-dim">
          <span>{PROFILE.name}, Hong Kong</span>
          <span>built with React + Vite, hosted on GitHub Pages</span>
        </div>
      </footer>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </>
  );
}
