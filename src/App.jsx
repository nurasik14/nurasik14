import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './components/TopBar';
import About from './components/About';
import Projects from './components/Projects';
import Dashboards from './components/Dashboards';
import Blog from './components/Blog';
import Contact from './components/Contact';
import Footer from './components/Footer';
import { PROJECTS } from './config/projects.config';
import { CRUMB, PROFILE } from './config/site.config';
import { Panel, Chip, StatusDot } from './components/ui';

function ModulesIndex({ goto }) {
  return (
    <Panel
      title="system_modules.index"
      accent="amber"
      right={<Chip tone="amber">3 registered</Chip>}
      bodyClass="p-0"
    >
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-[64px]">id</th>
            <th>module</th>
            <th className="w-[78px]">state</th>
            <th className="w-[84px]">uptime</th>
            <th className="hidden sm:table-cell">entrypoint</th>
            <th className="w-[92px]" />
          </tr>
        </thead>
        <tbody>
          {PROJECTS.map((p) => (
            <tr key={p.id}>
              <td className="text-neutral-500">{p.id}</td>
              <td className="truncate text-neutral-200">{p.name}</td>
              <td>
                <span className="flex items-center gap-1">
                  <StatusDot tone={p.status === 'ONLINE' ? 'green' : 'cyan'} live={p.status === 'ONLINE'} />
                  <span className="text-[10px] text-neutral-400">{p.status}</span>
                </span>
              </td>
              <td className="num text-neutral-500">{p.uptime}</td>
              <td className="hidden max-w-[280px] truncate text-neutral-600 sm:table-cell">{p.lang}</td>
              <td>
                <button type="button" onClick={() => goto(p.slug)} className="btn focus-ring">
                  [INSPECT]
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default function App() {
  const [tab, setTab] = React.useState('about');

  const goto = React.useCallback((slug) => {
    setTab('projects');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(slug)?.scrollIntoView({ block: 'start' });
      });
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const map = { 1: 'about', 2: 'projects', 3: 'dashboards', 4: 'blog', 5: 'contact' };
      if (map[e.key]) {
        e.preventDefault();
        setTab(map[e.key]);
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const crumb = CRUMB[tab];

  return (
    <div className="min-h-screen bg-black text-neutral-200">
      <TopBar tab={tab} setTab={setTab} />

      <main className="mx-auto w-full max-w-[1560px] px-2 py-2">
        {/* ---- breadcrumb ---- */}
        <div className="mb-2 flex flex-wrap items-center gap-2 border border-neutral-800 bg-[#0a0a0a] px-2.5 py-1.5">
          <span className="min-w-0 truncate font-mono text-[11px]">
            <span className="text-term-green">{PROFILE.handle}</span>
            <span className="text-neutral-600">@</span>
            <span className="text-term-cyan">{PROFILE.host}</span>
            <span className="text-neutral-600">:</span>
            <span className="text-neutral-400">{crumb.path}</span>
            <span className="text-neutral-600">$ </span>
            <span className="text-neutral-200">{crumb.cmd}</span>
          </span>
          <span className="ml-auto hidden items-center gap-2 font-mono text-[9.5px] text-neutral-600 sm:flex">
            <span>press 1–5 to switch views</span>
            <Chip tone="green">
              <StatusDot tone="green" /> tty1
            </Chip>
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.09, ease: 'linear' }}
          >
            {tab === 'about' && (
              <div className="flex flex-col gap-2">
                <About />
                <ModulesIndex goto={goto} />
              </div>
            )}
            {tab === 'projects' && <Projects />}
            {tab === 'dashboards' && <Dashboards />}
            {tab === 'blog' && <Blog />}
            {tab === 'contact' && <Contact />}
          </motion.div>
        </AnimatePresence>

        <Footer setTab={setTab} />
      </main>
    </div>
  );
}
