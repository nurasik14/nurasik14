// index.md: the portfolio buffer, laid out like a GitHub profile inside the
// editor shell: profile sidebar + a main column with UnderlineNav tabs.
// Section order = keyboard shortcut order (0 overview, 1-5 the rest).
import { EXPERIENCE, AWARDS, PROJECTS, TOOLS } from './config/portfolio.config';
import Awards from './components/Awards';
import Contact from './components/Contact';
import Contributions from './components/Contributions';
import Experience from './components/Experience';
import ProfileSidebar from './components/ProfileSidebar';
import ProfileTabs from './components/ProfileTabs';
import Projects from './components/Projects';
import Readme from './components/Readme';
import Stack from './components/Stack';
import AppShell from './shell/AppShell';

const SECTIONS = [
  { id: 'overview', label: 'overview', key: '0' },
  { id: 'projects', label: 'projects', key: '1' },
  { id: 'experience', label: 'experience', key: '2' },
  { id: 'awards', label: 'awards', key: '3' },
  { id: 'stack', label: 'stack', key: '4' },
  { id: 'contact', label: 'contact', key: '5' },
];
const num = Object.fromEntries(SECTIONS.map((s) => [s.id, s.key]));
const COUNTS = { projects: PROJECTS.length, experience: EXPERIENCE.length, awards: AWARDS.length, stack: TOOLS.length };

export default function App() {
  return (
    <AppShell page="index" sections={SECTIONS} outline="none">
      <div className="md:grid md:grid-cols-[14.5rem_minmax(0,1fr)] md:gap-6 min-[1012px]:grid-cols-[296px_minmax(0,1fr)] min-[1012px]:gap-8">
        <ProfileSidebar />
        <div className="profile-main mt-6 min-w-0 md:mt-0 md:pt-4">
          <ProfileTabs sections={SECTIONS} counts={COUNTS} />
          <Readme id="overview" />
          <Projects n={num.projects}>
            <Contributions />
          </Projects>
          <Experience n={num.experience} />
          <Awards n={num.awards} />
          <Stack n={num.stack} />
          <Contact n={num.contact} />
        </div>
      </div>
    </AppShell>
  );
}
