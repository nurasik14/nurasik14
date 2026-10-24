/* ================================================================ *
 *  rag.config.js — trilingual corpus + evaluation queries
 *
 *  corpus: the 26-doc demo slice (prod index holds 12,408 docs).
 *  PRESET_QUERIES: gold relevance judgements (qrels) used for the
 *  recall / MRR / nDCG readouts in the eval harness widget.
 * ================================================================ */


export const CORPUS = [
  {
    id: 'kk-001',
    lang: 'kk',
    src: 'kazakh-news/v2',
    title: 'Қазақ тілін өңдеуге арналған корпус',
    text: 'Қазақ тілі — агглютинативті тіл, сондықтан морфологиялық талдау қажет. Корпус 12 мың құжаттан тұрады және жаңалықтар, заң құжаттары мен әдеби мәтіндерді қамтиды. Токенизация кезінде қосымшаларды дұрыс бөлу маңызды.',
  },
  {
    id: 'kk-002',
    lang: 'kk',
    src: 'kazakh-news/v2',
    title: 'Қазақша сөздік пен лемматизация',
    text: 'Лемматизатор қазақ тіліндегі жұрнақтарды алып тастап, түбірді қайтарады. Бұл BM25 индексінің сапасын арттырады, себебі сөз формаларының вариациясы азаяды.',
  },
  {
    id: 'kk-003',
    lang: 'kk',
    src: 'gov-legal/kz',
    title: 'Заң құжаттарын автоматты өңдеу',
    text: 'Мемлекеттік құжаттарды өңдеу үшін құрылымдық парсинг қолданылады. Әр құжаттың тарау, бап және тармақ иерархиясы сақталады, бұл ретриверге чанк шекараларын дұрыс қоюға көмектеседі.',
  },
  {
    id: 'kk-004',
    lang: 'kk',
    src: 'edu-textbooks',
    title: 'Оқулықтардан жасалған датасет',
    text: 'Мектеп оқулықтарынан жиналған мәтіндер тазартылып, дедупликациядан өткізілді. Әр жазбада пән, сынып және тақырып метадеректері бар.',
  },
  {
    id: 'kk-005',
    lang: 'kk',
    src: 'kazakh-news/v2',
    title: 'Аударма сапасын бағалау',
    text: 'Қазақша-орысша аударма үшін BLEU және chrF метрикалары қолданылды. Морфологиялық байлыққа байланысты chrF метрикасы дәлірек нәтиже көрсетті.',
  },
  {
    id: 'kk-006',
    lang: 'kk',
    src: 'social-web',
    title: 'Әлеуметтік желі мәтіндерін талдау',
    text: 'Әлеуметтік желідегі қазақ тіліндегі мәтіндер код-свитчингке толы. Аралас тілді мәтіндер үшін тілді анықтау модулі сөз деңгейінде жұмыс істейді.',
  },
  {
    id: 'ru-001',
    lang: 'ru',
    src: 'kazakh-news/v2',
    title: 'Обработка казахского языка: морфология',
    text: 'Казахский язык относится к агглютинативным, поэтому число словоформ на лемму достигает нескольких десятков. Для поиска это критично: без лемматизации BM25 теряет recall на длинных суффиксальных цепочках.',
  },
  {
    id: 'ru-002',
    lang: 'ru',
    src: 'gov-legal/kz',
    title: 'Структурный парсинг нормативных актов',
    text: 'Нормативные акты имеют строгую иерархию: глава, статья, пункт, подпункт. Парсер сохраняет эти уровни, что позволяет чанкинг вести по границам статей, а не по фиксированному числу токенов.',
  },
  {
    id: 'ru-003',
    lang: 'ru',
    src: 'ru-wiki-mirror',
    title: 'Гибридный поиск: BM25 и плотные векторы',
    text: 'Гибридный поиск объединяет разреженный BM25 и плотное векторное пространство. Оценки нормализуются, затем складываются с весом альфа. На смешанных запросах гибрид стабильно обходит каждый из методов в отдельности.',
  },
  {
    id: 'ru-004',
    lang: 'ru',
    src: 'ru-wiki-mirror',
    title: 'Оценка качества retrieval: recall и MRR',
    text: 'Для оценки ретривера используют recall@k, MRR и nDCG. Разметка gold-документов делается вручную на выборке запросов. Метрики считаются на фиксированном top-k, обычно 5 или 10.',
  },
  {
    id: 'ru-005',
    lang: 'ru',
    src: 'edu-textbooks',
    title: 'Дедупликация корпуса перед обучением',
    text: 'Перед индексацией корпус проходит MinHash-дедупликацию с порогом Жаккара 0.85. Это уменьшает число near-duplicate новостей, которые завышают частотные статистики BM25.',
  },
  {
    id: 'ru-006',
    lang: 'ru',
    src: 'social-web',
    title: 'Определение языка в смешанных текстах',
    text: 'В казахстанском сегменте соцсетей предложения часто смешивают русский и казахский. Языковая идентификация работает на уровне токенов и использует частотный словарь плюс эвристики по аффиксам.',
  },
  {
    id: 'en-001',
    lang: 'en',
    src: 'arxiv-mirror',
    title: 'Retrieval-Augmented Generation for low-resource languages',
    text: 'RAG reduces hallucination in low-resource settings by grounding generation in retrieved passages. For Kazakh, the bottleneck is retrieval quality rather than the generator: dense encoders trained on English transfer poorly to agglutinative morphology.',
  },
  {
    id: 'en-002',
    lang: 'en',
    src: 'arxiv-mirror',
    title: 'Hybrid BM25 + dense retrieval with reciprocal rank fusion',
    text: 'Reciprocal rank fusion combines ranked lists from sparse and dense retrievers without score calibration. RRF score is the sum of 1/(k + rank) over lists, with k typically 60. It is robust when score scales differ.',
  },
  {
    id: 'en-003',
    lang: 'en',
    src: 'hf-docs',
    title: 'Chunking strategy and passage boundaries',
    text: 'Fixed-size chunking with overlap is the baseline, but structure-aware chunking on section boundaries yields higher answer attribution. Chunk size 320 tokens with 48-token overlap performed best on the trilingual set.',
  },
  {
    id: 'en-004',
    lang: 'en',
    src: 'hf-docs',
    title: 'Cross-encoder reranking of the candidate pool',
    text: 'A cross-encoder reranker rescores the top-100 candidates from the first stage. Latency budget on CPU forces a small model; distilling a multilingual MiniLM into a 4-layer student kept nDCG@10 within 1.4 points of the teacher.',
  },
  {
    id: 'en-005',
    lang: 'en',
    src: 'internal-notes',
    title: 'Tokenizer fertility and multilingual vocabularies',
    text: 'Tokenizer fertility measures subword tokens per word. Kazakh shows 3.1 fertility on an English-centric BPE vocab versus 1.6 after extending the vocab with 24k Kazakh-specific merges, which cuts sequence length by 38 percent.',
  },
  {
    id: 'en-006',
    lang: 'en',
    src: 'internal-notes',
    title: 'Evaluation harness design for retrieval ablations',
    text: 'The harness pins corpus version, chunker, embedder and top-k behind a single config, then writes every run to a JSONL ledger. Deterministic seeds make ablations comparable across weeks of iteration.',
  },
  {
    id: 'en-007',
    lang: 'en',
    src: 'arxiv-mirror',
    title: 'FAISS indexing: IVF-PQ versus HNSW',
    text: 'HNSW gives strong recall at low latency for corpora under a few million vectors. IVF-PQ compresses memory 8-16x at a recall cost. On the 12k-document slice a flat index is exact and still serves queries in single-digit milliseconds.',
  },
  {
    id: 'en-008',
    lang: 'en',
    src: 'hf-docs',
    title: 'Prompt compression and context budgeting',
    text: 'Before generation, retrieved passages are trimmed to a token budget with per-passage caps. Budgeting by ranked score instead of truncation order preserved 96 percent of answer-bearing sentences at half the context cost.',
  },
  {
    id: 'kk-007',
    lang: 'kk',
    src: 'kazakh-news/v2',
    title: 'Жаңалықтар корпусының статистикасы',
    text: 'Жаңалықтар корпусында 12 408 құжат бар. Орташа құжат ұзындығы 412 токен. Ең жиі кездесетін тақырыптар — экономика, білім және спорт.',
  },
  {
    id: 'kk-008',
    lang: 'kk',
    src: 'edu-textbooks',
    title: 'Қазақ тілінің морфологиялық ерекшеліктері',
    text: 'Қазақ тілінде бір түбірге отызға жуық қосымша жалғана алады. Бұл сипат инверттелген индекстің салмағын арттырады және сұраныстардың дәлдігін төмендетеді.',
  },
  {
    id: 'ru-007',
    lang: 'ru',
    src: 'ru-wiki-mirror',
    title: 'Латентные ошибки генерации и галлюцинации',
    text: 'Без Retrieval-Augmented Generation модель склонна выдумывать факты о малоизвестных сущностях. Подмешивание Retrieved passages снижает долю неподтверждённых утверждений в два-три раза на выборке казахстанских вопросов.',
  },
  {
    id: 'ru-008',
    lang: 'ru',
    src: 'internal-notes',
    title: 'Латентность пайплайна и бюджет на CPU',
    text: 'Полный цикл вопрос-ответ на CPU: токенизация 4 мс, BM25 6 мс, плотный поиск 21 мс, реранк 34 мс, генерация 780 мс. Узкое место — генерация, поэтому оптимизация ретривера даёт мало выигрыша по end-to-end latency.',
  },
  {
    id: 'en-009',
    lang: 'en',
    src: 'internal-notes',
    title: 'Cross-lingual transfer of sentence encoders',
    text: 'Multilingual encoders align languages in a shared space, but alignment quality degrades for low-resource pairs. Adding parallel Kazakh-Russian pairs to the contrastive fine-tune lifted Recall@5 from 0.61 to 0.78.',
  },
  {
    id: 'en-010',
    lang: 'en',
    src: 'arxiv-mirror',
    title: 'Reinforcement learning from human feedback in RAG',
    text: 'Preference optimisation over citation-correctness rewards improves grounding. The reward model scores whether every generated claim is supported by a retrieved passage, penalising unsupported spans.',
  },
];

// Gold relevance judgements for the shipped query set (qrels).
export const PRESET_QUERIES = [
  {
    q: 'қазақ тілінің морфологиясы және қосымшалар',
    lang: 'kk',
    gold: ['kk-001', 'kk-008', 'kk-002', 'ru-001', 'en-005'],
  },
  {
    q: 'гибридный поиск BM25 и плотные векторы',
    lang: 'ru',
    gold: ['ru-003', 'en-002', 'ru-004', 'en-001'],
  },
  {
    q: 'how to evaluate retrieval recall and MRR',
    lang: 'en',
    gold: ['ru-004', 'en-006', 'ru-003', 'en-004'],
  },
  {
    q: 'чанкинг и границы пассажей в корпусе',
    lang: 'ru',
    gold: ['ru-002', 'en-003', 'ru-005'],
  },
  {
    q: 'tokenizer fertility for Kazakh subword vocab',
    lang: 'en',
    gold: ['en-005', 'en-003', 'kk-008'],
  },
  {
    q: 'латентность reranking на CPU',
    lang: 'ru',
    gold: ['ru-008', 'en-004', 'en-007'],
  },
];

export const LANG_META = {
  kk: { label: 'KAZAKH', color: 'text-term-amber' },
  ru: { label: 'RUSSIAN', color: 'text-term-cyan' },
  en: { label: 'ENGLISH', color: 'text-term-green' },
};
