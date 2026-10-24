import { PROJECTS } from '../config/portfolio.config';
import ProjectStats from './ProjectStats';
import { Section, SectionHeader } from './Section';
import ToolCallVisualizer from './ToolCallVisualizer';

const count = (status) => PROJECTS.filter((p) => p.status === status).length;

export default function Projects() {
  return (
    <Section id="projects">
      <SectionHeader
        name="projects"
        aside={`${count('complete')} finished, ${count('running')} running, ${count('archived')} archived`}
      />
      <p className="mt-4 max-w-[44em] font-sans text-base leading-relaxed text-fg-dim">
        Each project is a tool call. Open one to see its input on the left and the measured output on the right. Where I
        haven't measured something yet, the chart stays empty.
      </p>
      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-3">
        {PROJECTS.map((p) => (
          <ToolCallVisualizer
            key={p.id}
            id={p.id}
            name={p.name}
            input={p.input}
            description={p.description}
            status={p.status}
            defaultOpen={p.defaultOpen}
            inputLabel={p.inputFile}
            statsLabel={p.statsFile}
            stats={<ProjectStats stats={p.stats} />}
          />
        ))}
      </div>
    </Section>
  );
}
