// index.md as a GitHub-style profile: config rules and server-rendered markup
// (the repo has no DOM test setup, so effects do not run; data-driven parts
// render their loading state).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import Contributions from '../../src/components/Contributions.jsx';
import Experience from '../../src/components/Experience.jsx';
import ProfileSidebar from '../../src/components/ProfileSidebar.jsx';
import ProfileTabs from '../../src/components/ProfileTabs.jsx';
import ProjectStats from '../../src/components/ProjectStats.jsx';
import Projects from '../../src/components/Projects.jsx';
import Readme from '../../src/components/Readme.jsx';
import { AWARDS, NOW, PROFILE, PROJECTS, TOOLS } from '../../src/config/portfolio.config.js';
import { ShellContext } from '../../src/shell/context.js';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const ALLOWED = new Set(['★', '✓']); // typographic glyphs used by the design
const emojiIn = (s) => [...s].filter((ch) => EMOJI.test(ch) && !ALLOWED.has(ch));

describe('config', () => {
  test('pin order, then the archived projects', () => {
    expect(PROJECTS.map((p) => p.name)).toEqual([
      'train_dqn',
      'overworld-hyprland',
      'lastfm-taste-mcp',
      'apothecaries_quests',
      'ollama_search',
      'kazakh_rag',
      'character_memory',
      'handsfree_cursor',
    ]);
  });
  test('ids are unique, statuses known, repos are owner/name', () => {
    expect(new Set(PROJECTS.map((p) => p.id)).size).toBe(PROJECTS.length);
    for (const p of PROJECTS) {
      expect(['complete', 'running', 'archived']).toContain(p.status);
      if (p.input?.repo) expect(p.input.repo).toMatch(/^nurasik14\/[\w.-]+$/);
      expect(typeof p.stats === 'string' ? ['dqn', 'search', 'rag'] : ['object']).toContain(
        typeof p.stats === 'string' ? p.stats : typeof p.stats,
      );
    }
  });
  test('the facts the owner gave', () => {
    expect(PROFILE.status).toBe('open to AI/ML internships, summer 2027');
    expect(PROFILE.github).toBe('nurasik14');
    expect(PROFILE.avatar).toBe('https://avatars.githubusercontent.com/u/76750044?v=4');
    const rag = PROJECTS.find((p) => p.name === 'kazakh_rag');
    expect(rag.input.repo).toBe('nurasik14/Kazakh-RAG');
    expect(rag.result).toBe('design phase; no code or results yet');
    expect(PROJECTS.find((p) => p.name === 'overworld-hyprland').result).toBe('19 stars on GitHub');
    expect(PROJECTS.find((p) => p.name === 'lastfm-taste-mcp').result).toBe('24 read-only tools');
    expect(NOW.length).toBe(3);
    for (const t of ['hermes agent', 'claude code', 'mcp', 'svelte', 'bun', 'hono', 'qml / quickshell']) {
      expect(TOOLS.map((x) => x[0])).toContain(t);
    }
  });
  test('no emoji in config or the new components', () => {
    const files = [
      'src/config/portfolio.config.js',
      'src/App.jsx',
      'src/components/ProfileSidebar.jsx',
      'src/components/ProfileTabs.jsx',
      'src/components/Readme.jsx',
      'src/components/Projects.jsx',
      'src/components/Contributions.jsx',
      'src/components/Experience.jsx',
      'src/lib/contrib.js',
      'src/lib/github.js',
    ];
    for (const f of files) expect([f, emojiIn(readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8'))]).toEqual([f, []]);
  });
});

describe('sidebar', () => {
  const html = renderToStaticMarkup(<ProfileSidebar />);
  test('name is the h1 at profile size, handle under it', () => {
    expect(html).toMatch(/<h1[^>]*text-\[24px\][^>]*>Nurassyl Serikov/);
    expect(html).not.toContain('clamp(2.75rem');
    expect(html).toContain('nurasik14');
  });
  test('avatar: decorative, eager, sized', () => {
    expect(html).toMatch(/<img[^>]*src="https:\/\/avatars\.githubusercontent\.com\/u\/76750044\?v=4"/);
    expect(html).toMatch(/<img[^>]*alt=""/);
    expect(html).toMatch(/<img[^>]*loading="eager"/);
    expect(html).toMatch(/<img[^>]*width="260"[^>]*height="260"/);
  });
  test('status pill, one amber action, email', () => {
    expect(html).toContain('open to AI/ML internships');
    expect(html).toContain('summer 2027');
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toMatch(/btn btn-primary[^"]*"[^>]*>cv\.pdf/);
    expect(html).toContain(`href="mailto:${PROFILE.email}"`);
  });
  test('meta and achievements, no counts before github.json loads', () => {
    expect(html).toContain('City University of Hong Kong');
    expect(html).toContain('BSc CS 2026-2030');
    for (const a of AWARDS) expect(html).toContain(a.title.replace('&', '&amp;'));
    expect(html).not.toContain('followers');
  });
});

describe('tabs', () => {
  const sections = [
    { id: 'overview', label: 'overview', key: '0' },
    { id: 'projects', label: 'projects', key: '1' },
    { id: 'contact', label: 'contact', key: '5' },
  ];
  const render = (section) =>
    renderToStaticMarkup(
      <ShellContext.Provider value={{ mode: 'NORMAL', section, setMode() {}, flash() {}, registerCommands: () => () => {} }}>
        <ProfileTabs sections={sections} counts={{ projects: 8 }} />
      </ShellContext.Provider>,
    );
  test('anchor links with shortcuts and a count', () => {
    const html = render(null);
    expect(html).toContain('aria-label="Profile sections"');
    expect(html).toContain('href="#projects"');
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toMatch(/projects<\/span><span[^>]*>.*8/);
  });
  test('the current section is marked, defaulting to overview', () => {
    expect(render(null).match(/aria-current="location"/g)).toHaveLength(1);
    expect(render(null)).toMatch(/href="#overview" aria-current="location"/);
    expect(render(sections[1])).toMatch(/href="#projects" aria-current="location"/);
  });
});

describe('readme', () => {
  const html = renderToStaticMarkup(<Readme />);
  test('frame, frontmatter, now list, fig. 1', () => {
    expect(html).toContain('README.md');
    expect(html).toContain('id="overview"');
    expect(html).toContain('summer 2027');
    for (const x of NOW) expect(html).toContain(x.split(':')[0]);
    expect(html).toContain('id="fig-1"');
    expect(html).toContain('role="group"'); // the keyboard-steppable chart
  });
});

describe('projects', () => {
  const html = renderToStaticMarkup(<Projects n="1" />);
  test('pinned cards with deep-link ids and disclosure buttons', () => {
    for (const p of PROJECTS) {
      expect(html).toContain(`id="project-${p.id}"`);
      expect(html).toContain(`aria-controls="project-${p.id}-panel"`);
    }
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(PROJECTS.length);
    expect(html.match(/class="pinned-details"/g)).toHaveLength(6);
  });
  test('names link to their repos; status is a word, not just colour', () => {
    expect(html).toContain('href="https://github.com/nurasik14/overworld-hyprland"');
    expect(html).toContain('href="https://github.com/nurasik14/Kazakh-RAG"');
    expect(html).toMatch(/✓<\/span><span class="sr-only">status: <\/span>complete/);
    expect(html).toMatch(/●<\/span><span class="sr-only">status: <\/span>running/);
  });
  test('the rag panel shows unmeasured metrics and only the published baseline', () => {
    const rag = renderToStaticMarkup(<ProjectStats stats="rag" />);
    expect(rag).toContain('NDCG@10');
    expect(rag).toContain('MRR');
    expect(rag.match(/not measured/g).length).toBeGreaterThanOrEqual(2);
    expect(rag).toContain('0.389');
    expect(rag).not.toContain('recall@5');
  });
});

describe('activity and experience', () => {
  test('the graph starts in an honest loading state, with no numbers', () => {
    const html = renderToStaticMarkup(<Contributions />);
    expect(html).toContain('id="activity"');
    expect(html).toContain('loading data/github.json');
    expect(html).not.toMatch(/\d+ contributions/);
  });
  test('experience is a dated timeline grouped by year', () => {
    const html = renderToStaticMarkup(<Experience n="2" />);
    expect(html).toContain('2025');
    expect(html).toContain('AuaLine');
    expect(html).toContain('border-l');
  });
});
