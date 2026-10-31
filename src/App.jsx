// index.md: the portfolio buffer. Section order = keyboard shortcut order.
import Awards from './components/Awards';
import Contact from './components/Contact';
import Experience from './components/Experience';
import Hero from './components/Hero';
import Projects from './components/Projects';
import Stack from './components/Stack';
import AppShell from './shell/AppShell';

const SECTIONS = [
  { id: 'projects', label: 'projects', key: '1' },
  { id: 'experience', label: 'experience', key: '2' },
  { id: 'awards', label: 'awards', key: '3' },
  { id: 'stack', label: 'stack', key: '4' },
  { id: 'contact', label: 'contact', key: '5' },
];
const num = Object.fromEntries(SECTIONS.map((s) => [s.id, s.key]));

export default function App() {
  return (
    <AppShell page="index" sections={SECTIONS}>
      <Hero />
      <Projects n={num.projects} />
      <Experience n={num.experience} />
      <Awards n={num.awards} />
      <Stack n={num.stack} />
      <Contact n={num.contact} />
    </AppShell>
  );
}
