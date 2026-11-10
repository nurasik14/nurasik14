<!-- Banner -->
<p align="center">
  <img src="./img/LiburBanner.jpg" alt="anime banner" width="100%">
</p>

<h1 align="center">I'm <b>Nurasik12</b></h1>

<p align="center">
  <a href="https://nurasik14.github.io/nurasik14/">
    <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=18&duration=2800&pause=1000&color=F0B35A&center=true&vCenter=true&width=560&height=32&lines=LLM+agents+that+call+real+tools;RL+agents+that+learn+from+reward+alone;Retrieval+for+Kazakh%2C+a+low-resource+language;Hyprland+desktops+nobody+asked+for" alt="LLM agents, RL, Kazakh retrieval, Hyprland desktops">
  </a>
</p>

<p align="center">
  <i>"Every man has two lives, and the second starts when he realizes he has just one." — Confucius</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/based_in-Hong_Kong-111316?style=flat-square&labelColor=191c21" alt="based in Hong Kong">
  <img src="https://img.shields.io/badge/CS-CityUHK_'30-111316?style=flat-square&labelColor=191c21" alt="CS at City University of Hong Kong, class of 2030">
  <img src="https://img.shields.io/badge/open_to-AI%2FML_internships_%C2%B7_summer_2027-f0b35a?style=flat-square&labelColor=191c21" alt="open to AI/ML internships, summer 2027">
  <img src="https://komarev.com/ghpvc/?username=nurasik14&label=profile+views&style=flat-square&color=82aed6&labelColor=191c21" alt="profile views">
</p>

---

## `$ whoami`

```yaml
name:    Nurassyl Serikov              # a.k.a. Nurasik
route:   Taraz, Kazakhstan -> Hong Kong
study:   BSc Computer Science @ City University of Hong Kong   # 2026-2030, full scholarship
focus:   [LLM agents & tool use, retrieval (RAG), reinforcement learning]
speaks:  [kazakh, russian, english]
status:  open to AI/ML internships for summer 2027
```

- **Building:** a Kazakh retriever meant to beat the published KazQAD baselines, a voice layer for my agent setup, MCP servers that give agents real tools, and a Minecraft-themed Linux desktop.
- **How I work:** I run Hermes Agent as my orchestrator and hand coding to Claude Code, and I keep the logs. If one of my READMEs has a number, a training run or an eval produced it.
- **Learning:** linear algebra, probability and algorithms at CityU, and how transformers work under the hood.
- **Olympiads:** International AI Olympiad (FAIO) bronze 2025 · StemCo Global Sciences gold 2025 · Iranian Geometry Olympiad bronze 2024.

## `$ cat goals.md`

I want language models to work as well in Kazakh as they do in English. Low-resource languages get
worse retrieval, worse evals and fewer datasets, and I want to fix a piece of that. Alongside it, I
build agents that do useful work with real tools and leave logs you can check.

- [x] Get into CityU on a full scholarship
- [x] Train a DQN agent from reward alone and publish the curves
- [ ] Beat the KazQAD retrieval baseline (NDCG@10 0.389) with my own Kazakh retriever
- [ ] Release the retriever and its eval set on Hugging Face
- [ ] Land an ML/AI internship for summer 2027
- [ ] Write up the retrieval results as a first paper or workshop submission
- [ ] Turn my agent setup into an always-on coworker I can talk to (below)

### Next build: a voice for my agents

Today I type to [Hermes Agent](https://github.com/NousResearch/hermes-agent), which plans the work and
runs Claude Code as a subprocess to write the code. The plan is to give that setup a voice, so that it
feels like one session that never ends: I talk, it keeps working in the background, and I can cut in
mid-task to change direction without starting over.

```text
 me (mic / speaker)
      |  ^
      v  |
 voice layer  -- the mouth --   streaming STT -> polisher -> streaming TTS
      |  ^                      (polisher: drops filler words, fixes STT slips,
      v  |                       decides "command" vs "thinking out loud")
 Hermes Agent -- the brain  --   plans, remembers, decides, steers
      |  ^
      v  |
 Claude Code  -- the hands  --   edits files, runs commands, reports back
```

- [ ] Streaming STT and TTS with barge-in: when I start speaking, playback stops at once and the words go to Hermes.
- [ ] Polisher: a small local model (Ollama) cleans the transcript and tags it as a command or a thought.
- [ ] Steering instead of restarting: interruptions reach Hermes as mid-turn messages; Hermes decides whether to stop the Claude Code subprocess or let it finish.
- [ ] Two outputs from the brain: a short spoken summary for the TTS, and the full log for the screen.
- [ ] Proactive updates: it speaks up when a long task finishes or needs approval, not only when asked.
- [ ] Long-running memory: older turns get compressed into a running task summary so the session can last for days.

## `$ ls ~/projects`

| project | what it does | stack |
|:--|:--|:--|
| [**overworld-hyprland**](https://github.com/nurasik14/overworld-hyprland) <img src="https://img.shields.io/github/stars/nurasik14/overworld-hyprland?style=flat-square&color=f0b35a&labelColor=191c21&label=stars" alt="stars"> | Minecraft as a Linux desktop: hotbar workspaces, creative-inventory launcher, advancement toasts, real weather and day/night | QML, Quickshell, Hyprland |
| [**Apothecaries-quests**](https://github.com/nurasik14/Apothecaries-quests) | Self-hosted quest journal: an LLM writes three real-life quests sized to your energy | TypeScript, Bun, Hono, Svelte |
| [**lastfm-taste-mcp**](https://github.com/nurasik14/lastfm-taste-mcp) | Read-only MCP server that lets an agent explore your Last.fm listening history | Python, MCP |
| [**FlappyBird-RL**](https://github.com/nurasik14/FlappyBird-RL) | Double vs Dueling DQN. Best reward 53.1 after 168,126 episodes | PyTorch, Gymnasium |
| [**OllamaSearch**](https://github.com/nurasik14/OllamaSearch) | Web search for a local LLM: native tool calling vs my own tool on self-hosted SearXNG | Python, Ollama, SearXNG |
| [**Kazakh-RAG**](https://github.com/nurasik14/Kazakh-RAG) | Question answering over a Kazakh corpus, starting with a retriever (design phase) | Python, Hugging Face |
| [**CityUHK_job_scraper**](https://github.com/nurasik14/CityUHK_job_scraper) | Scrapes CityU internship and student-helper boards; Claude rates each job against what you want | Python, Claude, Ollama |
| [**apothecary-hyprland-conf**](https://github.com/nurasik14/apothecary-hyprland-conf) | Switchable Hyprland theme from *The Apothecary Diaries*, with live light/dark | QML, Bash |

## `$ stack --list`

<table>
  <tr>
    <td><b>agent harnesses</b></td>
    <td>
      <a href="https://github.com/NousResearch/hermes-agent"><img src="https://img.shields.io/badge/Hermes_Agent-orchestrator-191c21?style=flat-square&labelColor=2c3139" alt="Hermes Agent (orchestrator)"></a>
      <a href="https://github.com/anthropics/claude-code"><img src="https://img.shields.io/badge/Claude_Code-coding_agent-D97757?style=flat-square&logo=claude&logoColor=white&labelColor=2c3139" alt="Claude Code (coding agent)"></a>
      <img src="https://img.shields.io/badge/MCP-tool_servers-191c21?style=flat-square&logo=modelcontextprotocol&logoColor=white&labelColor=2c3139" alt="MCP tool servers">
    </td>
  </tr>
  <tr>
    <td><b>languages</b></td>
    <td><img src="https://skillicons.dev/icons?i=python,ts,js,bash,cpp,php&perline=12" alt="Python, TypeScript, JavaScript, Bash, C++, PHP"></td>
  </tr>
  <tr>
    <td><b>ml / ai</b></td>
    <td>
      <img src="https://skillicons.dev/icons?i=pytorch,tensorflow,sklearn,opencv,anaconda&perline=12" alt="PyTorch, TensorFlow, scikit-learn, OpenCV, Anaconda"><br>
      <img src="https://img.shields.io/badge/Hugging_Face-FFD21E?style=flat-square&logo=huggingface&logoColor=black" alt="Hugging Face">
      <img src="https://img.shields.io/badge/Ollama-191c21?style=flat-square&logo=ollama&logoColor=white" alt="Ollama">
      <img src="https://img.shields.io/badge/Claude_API-D97757?style=flat-square&logo=anthropic&logoColor=white" alt="Claude API">
      <img src="https://img.shields.io/badge/Gymnasium-191c21?style=flat-square" alt="Gymnasium">
      <img src="https://img.shields.io/badge/NumPy-013243?style=flat-square&logo=numpy&logoColor=white" alt="NumPy">
      <img src="https://img.shields.io/badge/pandas-150458?style=flat-square&logo=pandas&logoColor=white" alt="pandas">
      <img src="https://img.shields.io/badge/MediaPipe-0097A7?style=flat-square&logo=mediapipe&logoColor=white" alt="MediaPipe">
    </td>
  </tr>
  <tr>
    <td><b>web / backend</b></td>
    <td><img src="https://skillicons.dev/icons?i=fastapi,nodejs,bun,react,svelte,tailwind,vite,postgres,sqlite,firebase&perline=12" alt="FastAPI, Node.js, Bun, React, Svelte, Tailwind, Vite, PostgreSQL, SQLite, Firebase"></td>
  </tr>
  <tr>
    <td><b>tools / os</b></td>
    <td>
      <img src="https://skillicons.dev/icons?i=linux,docker,git,githubactions,qt,vscode,obsidian,latex&perline=12" alt="Linux, Docker, Git, GitHub Actions, Qt, VS Code, Obsidian, LaTeX"><br>
      <img src="https://img.shields.io/badge/Fedora-51A2DA?style=flat-square&logo=fedora&logoColor=white" alt="Fedora">
      <img src="https://img.shields.io/badge/Hyprland-58E1FF?style=flat-square&logo=hyprland&logoColor=black" alt="Hyprland">
      <img src="https://img.shields.io/badge/Playwright-2EAD33?style=flat-square" alt="Playwright">
    </td>
  </tr>
</table>

## `$ gh stats`

<p align="center">
  <img src="https://raw.githubusercontent.com/nurasik14/nurasik14/output/overview.svg" alt="GitHub stats" width="49%">
  <img src="https://raw.githubusercontent.com/nurasik14/nurasik14/output/languages.svg" alt="Top languages" width="49%">
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/nurasik14/nurasik14/output/activity.svg" alt="Contributions in the last 12 months, with streaks" width="99%">
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nurasik14/nurasik14/output/snake.svg">
    <img src="https://raw.githubusercontent.com/nurasik14/nurasik14/output/snake-light.svg" alt="Snake eating my contribution graph" width="99%">
  </picture>
</p>

<sub>The cards are rebuilt daily from the GitHub API by <a href="./scripts/profile_stats.py"><code>scripts/profile_stats.py</code></a> (<a href="./.github/workflows/profile-stats.yml">workflow</a>), so they don't depend on a third-party stats server.</sub>

## `$ contact`

<p align="center">
  <a href="mailto:nurasik.s@my.cityu.edu.hk"><img src="https://img.shields.io/badge/Email-nurasik.s%40my.cityu.edu.hk-22c55e?style=for-the-badge&logo=gmail&logoColor=white"></a>
  <a href="https://github.com/nurasik14"><img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github"></a>
  <a href="https://t.me/nurasik12"><img src="https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white"></a>
  <a href="https://linkedin.com/in/nurasik12"><img src="https://img.shields.io/badge/LinkedIn-0077b5?style=for-the-badge&logo=linkedin"></a>
  <a href="https://huggingface.co/Nurasik12"><img src="https://img.shields.io/badge/Hugging%20Face-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black"></a>
</p>

---

## `$ open portfolio`

**Live site → https://nurasik14.github.io/nurasik14/**

My portfolio is laid out like a GitHub profile, running inside a code editor. On the left is a
profile sidebar. On the right are tabs, a `README.md` panel with real DQN training curves, pinned
project cards that expand into their config and measured results, and a contribution graph built from
the GitHub API. The editor parts are real: buffer tabs (`index.md`, `planner.cal` for my planner,
`news.fm` for my weekly news read aloud), a vim-style statusline, and a `:` command line. Number keys
jump between sections.

<a href="./screenshots/demo.png"><img src="./screenshots/demo.png" alt="Portfolio pages. Top left: profile with sidebar and README panel. Top right: pinned projects. Bottom left: planner.cal. Bottom right: news.fm. Right: the profile on a phone" width="100%"></a>

<p align="center"><sub>profile · pinned projects · planner.cal · news.fm · phone. Click for full size, or open the
<a href="./screenshots/">individual screenshots</a>.</sub></p>

<details>
<summary><b>Run it locally</b></summary>

<br>

React 19, Vite, Tailwind, run with bun.

```bash
bun install
bun run dev     # http://localhost:5173/  (planner: /planner/, news: /news/)
bun run build   # static site in dist/
```

- All portfolio content lives in `src/config/portfolio.config.js`. See [MAINTAINING.md](./MAINTAINING.md).
- On localhost the planner can sync with Google Calendar: sealed plans go to a dedicated `planner.cal`
  calendar, and event titles and times are published as a dashed overlay ([docs/PLANNER.md](./docs/PLANNER.md#google)).
- `news.fm` wrap-ups are encrypted before they are published ([docs/NEWS.md](./docs/NEWS.md)).
- Pushing to `main` redeploys the site via GitHub Actions.
- Stat cards locally: `GITHUB_TOKEN=$(gh auth token) python3 scripts/profile_stats.py --out stats`

</details>
