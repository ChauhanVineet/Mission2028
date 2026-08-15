import "server-only";
import {
  callWithRetry,
  createLlmClient,
  getModel,
  mapWithConcurrency,
  withLlmSlot,
} from "@/lib/llm/client";

export type QuestionType = "mcq_single" | "numerical";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultyCounts = Record<Difficulty, number>;

export type TopicRequest = {
  topicName: string;
  classLevel: 11 | 12;
  difficultyCounts: DifficultyCounts;
};

export type GeneratedQuestion = {
  topicIndex: number;
  type: QuestionType;
  question_text: string;
  options: string[];
  correct_answer: string;
  solution: string;
  difficulty: Difficulty;
};

// Exactly as it comes back from the model, matching QUESTIONS_SCHEMA's
// field names (snake_case topic_index). Mapped to GeneratedQuestion before
// leaving this module.
type RawGeneratedQuestion = {
  topic_index: number;
  type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  solution: string;
  difficulty: Difficulty;
};

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic_index: {
            type: "integer",
            description:
              "0-based index into the requested topic list (see the numbered topic breakdown in the prompt) that this question belongs to.",
          },
          type: {
            type: "string",
            enum: ["mcq_single", "numerical"],
            description:
              "mcq_single: single-correct multiple choice with 4 options. numerical: answer is a numeric value, no options.",
          },
          question_text: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
            description:
              "Exactly 4 options for mcq_single, formatted without leading labels like 'A)'. Empty array for numerical.",
          },
          correct_answer: {
            type: "string",
            description:
              "For mcq_single, the exact text of the correct option. For numerical, the numeric answer (plain number, e.g. '12.5').",
          },
          solution: {
            type: "string",
            description:
              "A full worked solution explaining how to arrive at the answer, step by step.",
          },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        },
        required: [
          "topic_index",
          "type",
          "question_text",
          "options",
          "correct_answer",
          "solution",
          "difficulty",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function describeCounts(counts: DifficultyCounts): string {
  return (Object.entries(counts) as [Difficulty, number][])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(", ");
}

function describeTopics(topics: TopicRequest[]): string {
  return topics
    .map((t, i) => {
      const total = Object.values(t.difficultyCounts).reduce((a, b) => a + b, 0);
      return (
        `Topic ${i} — "${t.topicName}" (Class ${t.classLevel} NCERT syllabus): ${total} questions. ` +
        `Difficulty breakdown: ${describeCounts(t.difficultyCounts)}.`
      );
    })
    .join("\n");
}

// How many questions to ask for in a single request.
//
// All of the numbers below are measured against claude-sonnet-5, not
// estimated. A single request streams output at ~110-120 tokens/sec no
// matter how many other requests are in flight (12 concurrent requests
// measured 957 tok/s in aggregate, with no rate limiting), so wall time is
// set by the size of the *largest* chunk, and parallelism is close to free.
//
// A full question — stem, four options, and a step-by-step solution — costs
// roughly 900-1,150 output tokens. So:
//
//   25 questions (a whole subject) -> ~12.5k tokens -> ~99s
//    7 questions                   -> up to 8k tokens -> up to 72s
//    5 questions                   -> ~5.5k tokens  -> ~48s
//
// A whole subject in one request does not fit: three subjects run at once
// and the route's maxDuration is 120s. Worse, a timeout looks transient, so
// it was retried twice — turning one over-long request into a guaranteed
// multi-minute failure.
//
// Five keeps every request comfortably inside the 90s client timeout while
// letting a hiccup retry one cheap chunk instead of redoing a whole subject.
const CHUNK_TARGET = 5;

function totalOf(counts: DifficultyCounts): number {
  return counts.easy + counts.medium + counts.hard;
}

// Takes `n` questions off a difficulty breakdown and returns
// [taken, remaining]. The subject-level difficulty totals are unaffected,
// since nothing is added or dropped here.
//
// The split is proportional across difficulties rather than easiest-first.
// Easiest-first looks harmless but skews cost badly: a hard question's
// worked solution runs far longer than an easy one, so draining easy
// questions first produced an all-easy first chunk and an all-hard last
// chunk, measured at 2,612 vs 8,000 output tokens for the same five
// questions — the last chunk hit the token cap and lost its whole batch.
// Proportional splitting keeps every chunk near the average.
function splitCounts(counts: DifficultyCounts, n: number): [DifficultyCounts, DifficultyCounts] {
  const levels: Difficulty[] = ["easy", "medium", "hard"];
  const total = totalOf(counts);
  const take = Math.min(n, total);

  const raw = levels.map((level) => (counts[level] * take) / total);
  const taken: DifficultyCounts = { easy: 0, medium: 0, hard: 0 };
  levels.forEach((level, i) => {
    taken[level] = Math.floor(raw[i]);
  });

  // Hand out what rounding left over, largest fractional part first, never
  // exceeding what that difficulty actually has available.
  let remainder = take - totalOf(taken);
  const order = levels
    .map((level, i) => ({ level, frac: raw[i] - Math.floor(raw[i]) }))
    .sort((a, b) => b.frac - a.frac);

  for (const { level } of order) {
    if (remainder <= 0) break;
    if (taken[level] < counts[level]) {
      taken[level] += 1;
      remainder -= 1;
    }
  }
  // Rounding can still leave a question unplaced if the preferred levels
  // were exhausted; put it wherever there is room.
  for (const level of levels) {
    while (remainder > 0 && taken[level] < counts[level]) {
      taken[level] += 1;
      remainder -= 1;
    }
  }

  return [
    taken,
    {
      easy: counts.easy - taken.easy,
      medium: counts.medium - taken.medium,
      hard: counts.hard - taken.hard,
    },
  ];
}

type ChunkEntry = { globalIndex: number; topic: TopicRequest };

// Packs topics into chunks of at most CHUNK_TARGET questions, splitting a
// topic across chunks when it is larger than one chunk (e.g. a single
// selected topic carrying all 25 of a subject's questions).
// Exported so the allocation maths can be checked without calling the API.
export function buildChunks(topics: TopicRequest[]): ChunkEntry[][] {
  const chunks: ChunkEntry[][] = [];
  let current: ChunkEntry[] = [];
  let currentCount = 0;

  topics.forEach((topic, globalIndex) => {
    let remaining = topic.difficultyCounts;
    while (totalOf(remaining) > 0) {
      if (currentCount >= CHUNK_TARGET) {
        chunks.push(current);
        current = [];
        currentCount = 0;
      }
      const take = Math.min(CHUNK_TARGET - currentCount, totalOf(remaining));
      const [taken, left] = splitCounts(remaining, take);
      current.push({ globalIndex, topic: { ...topic, difficultyCounts: taken } });
      currentCount += take;
      remaining = left;
    }
  });

  if (current.length > 0) chunks.push(current);
  return chunks;
}

// Spreads the subject's mcq/numerical totals across chunks in proportion to
// chunk size, using largest-remainder rounding so the per-chunk counts add
// back up to the subject totals exactly. Doing this centrally (rather than
// letting each chunk pick its own 80/20) is what guarantees the subject
// ends up with exactly 20 MCQ + 5 numerical.
export function allocateTypesAcrossChunks(
  chunkSizes: number[],
  typeCounts: Record<QuestionType, number>,
): Record<QuestionType, number>[] {
  const grandTotal = chunkSizes.reduce((a, b) => a + b, 0);
  const result = chunkSizes.map(() => ({ mcq_single: 0, numerical: 0 }));

  for (const type of ["numerical", "mcq_single"] as QuestionType[]) {
    const raw = chunkSizes.map((size) => (typeCounts[type] * size) / grandTotal);
    const floored = raw.map(Math.floor);
    let remainder = typeCounts[type] - floored.reduce((a, b) => a + b, 0);

    floored.forEach((n, i) => {
      result[i][type] = n;
    });

    // Hand out the leftovers to the chunks with the largest fractional
    // parts, skipping any chunk that is already full.
    const order = raw
      .map((value, i) => ({ i, frac: value - floored[i] }))
      .sort((a, b) => b.frac - a.frac);

    for (const { i } of order) {
      if (remainder <= 0) break;
      if (result[i].mcq_single + result[i].numerical >= chunkSizes[i]) continue;
      result[i][type] += 1;
      remainder -= 1;
    }

    // If rounding left questions unplaced (only possible when the preferred
    // chunks were full), place them anywhere with room.
    for (let i = 0; i < result.length && remainder > 0; i++) {
      while (remainder > 0 && result[i].mcq_single + result[i].numerical < chunkSizes[i]) {
        result[i][type] += 1;
        remainder -= 1;
      }
    }
  }

  return result;
}

// Generates every question for one subject. The work is split into
// parallel chunks (see CHUNK_TARGET), then merged back and validated.
//
// The mcq_single/numerical split is enforced once for the whole subject
// total, not per topic: splitting it per topic first (when a subject's 25
// questions are spread across 20+ topics) rounds almost every topic down to
// "1 question, 100% mcq_single", so the aggregate result skewed to nearly
// all MCQ with ~0 numerical despite requesting an 80/20 split.
export async function generateQuestions(params: {
  subjectName: string;
  topics: TopicRequest[];
  typeCounts: Record<QuestionType, number>;
}): Promise<GeneratedQuestion[]> {
  const { subjectName, topics, typeCounts } = params;
  const grandTotal = topics.reduce((sum, t) => sum + totalOf(t.difficultyCounts), 0);
  if (grandTotal === 0) return [];

  const chunks = buildChunks(topics);
  const chunkSizes = chunks.map((chunk) =>
    chunk.reduce((sum, { topic }) => sum + totalOf(topic.difficultyCounts), 0),
  );
  const chunkTypeCounts = allocateTypesAcrossChunks(chunkSizes, typeCounts);

  // Hard stop for the whole subject, comfortably inside the schedule
  // route's maxDuration of 120s, so a slow provider surfaces as a real
  // error message instead of the function being killed mid-request.
  const deadlineAt = Date.now() + 105_000;

  // Each chunk is an independent request; the shared semaphore in
  // withLlmSlot caps how many run at once across all subjects.
  const perChunk = await mapWithConcurrency(chunks, chunks.length, (chunk, i) =>
    withLlmSlot(() =>
      generateChunk({
        subjectName,
        chunk,
        typeCounts: chunkTypeCounts[i],
        deadlineAt,
      }),
    ),
  );

  // Chunks can't see each other's output, so near-duplicates are possible
  // when one topic is split across chunks. Drop exact repeats.
  const seen = new Set<string>();
  return perChunk.flat().filter((q) => {
    const key = q.question_text.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function generateChunk(params: {
  subjectName: string;
  chunk: ChunkEntry[];
  typeCounts: Record<QuestionType, number>;
  deadlineAt: number;
}): Promise<GeneratedQuestion[]> {
  const { subjectName, chunk, typeCounts, deadlineAt } = params;
  const topics = chunk.map(({ topic }) => topic);
  const grandTotal = topics.reduce((sum, t) => sum + totalOf(t.difficultyCounts), 0);
  if (grandTotal === 0) return [];

  const client = createLlmClient();
  const startedAt = Date.now();

  const response = await callWithRetry(() =>
    client.messages.create({
      model: getModel(),
      // Cost per question varies a lot with difficulty — an easy question's
      // solution measured ~520 output tokens, a hard one ~1,600. At
      // CHUNK_TARGET of 5, an all-hard chunk can therefore reach ~8,000,
      // which is exactly where a previous 8,000 cap truncated the JSON and
      // lost the whole chunk. 12,000 covers the worst case with room spare;
      // unused headroom costs nothing, since billing is on actual output.
      max_tokens: 12000,
      system:
        "You are an expert JEE (Joint Entrance Examination) question setter for Indian Class 11-12 students preparing for JEE Main. " +
        "You write original, exam-quality questions that strictly match the JEE Main pattern: single-correct MCQs (4 options) and " +
        "numerical-answer questions, in the exact type counts requested — this mirrors JEE Main's fixed Section A (MCQ) / Section B " +
        "(numerical) structure and is not negotiable. Every question must be self-contained, unambiguous, and solvable without " +
        "external references. Every solution must be a clear, correct, step-by-step derivation a student can learn from.\n\n" +
        "SOLUTION LENGTH: keep each solution under about 120 words. Show the governing relation, the substitution, and the " +
        "final answer — skip restating the question, skip narration, and don't spell out routine arithmetic. A student " +
        "reviewing a wrong answer needs the key steps, not an essay.\n\n" +
        "For mcq_single, correct_answer MUST be the exact full text of the correct option, never a letter label like 'B'.\n\n" +
        "TEXT FORMATTING — strict, no exceptions: all text is rendered as plain text with no markup interpreter (no LaTeX, no " +
        "HTML, no Markdown). Never write LaTeX (no $, \\_, \\^, \\frac, \\text, etc.), HTML tags (no <sub>, <sup>), Markdown, or " +
        "literal escape-sequence text such as \\u2082 or \\u00b2. For subscripts and superscripts (chemical formulas, exponents, " +
        "units, ordinals), type the actual Unicode character directly, e.g. H₂O, CO₂, Fe²⁺, x², 10⁻³, Ω, °C, √, π, ×, ÷, ±, ≤, ≥, " +
        "→. If a required character has no clean Unicode subscript/superscript form, write it inline instead (e.g. 'x to the " +
        "power n' or 'x^n' as last resort, never a raw escape code).",
      messages: [
        {
          role: "user",
          content:
            `Generate exactly ${grandTotal} JEE Main-style questions total for ${subjectName}, covering these topics ` +
            `(follow every count exactly — this is a strict JEE Main format requirement):\n\n` +
            describeTopics(topics) +
            `\n\nQuestion type breakdown across the ENTIRE set (follow this exactly — this is a strict JEE Main format ` +
            `requirement): ${typeCounts.mcq_single} mcq_single, ${typeCounts.numerical} numerical, distributed across ` +
            `the topics above however makes sense (a single topic can be all one type). ` +
            `Tag every question with the topic_index it belongs to, exactly matching the numbers above. ` +
            `Distribute difficulty levels across both question types as makes sense pedagogically. ` +
            `Do not repeat the same question idea twice, including across different topics.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: QUESTIONS_SCHEMA,
        },
      },
    }),
    { deadlineAt },
  );

  // Timing and token counts land in the Vercel function logs. Generation
  // time is the app's main failure mode, and these numbers are what make a
  // slow or failing test diagnosable after the fact instead of guesswork.
  console.info(
    `[questions] ${subjectName} chunk of ${grandTotal}: ` +
      `${((Date.now() - startedAt) / 1000).toFixed(1)}s, ` +
      `${response.usage.output_tokens} output tokens`,
  );

  // Hitting the token cap truncates the JSON mid-object, which would
  // otherwise surface as a confusing "malformed JSON" error. Name it.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      "The question generator ran out of output space before finishing (max_tokens).",
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const content = textBlock && textBlock.type === "text" ? textBlock.text : null;
  if (!content) {
    throw new Error("The question generator returned an empty response.");
  }

  let parsed: { questions: RawGeneratedQuestion[] };
  try {
    parsed = JSON.parse(content) as { questions: RawGeneratedQuestion[] };
  } catch {
    throw new Error("The question generator returned malformed JSON.");
  }

  if (!Array.isArray(parsed?.questions)) {
    throw new Error("The question generator returned no questions.");
  }

  // The schema uses snake_case topic_index (models follow schema field names
  // literally); map it to the camelCase shape the rest of the app expects.
  //
  // The model is prompted with this chunk's topics numbered from 0, so the
  // index it returns is chunk-local and has to be translated back to the
  // subject-wide index the caller uses. Anything out of range falls back to
  // the chunk's first topic rather than being dropped.
  const mapped = parsed.questions.map((q) => ({
    topicIndex:
      q.topic_index >= 0 && q.topic_index < chunk.length
        ? chunk[q.topic_index].globalIndex
        : chunk[0].globalIndex,
    type: q.type,
    question_text: cleanQuestionText(q.question_text ?? ""),
    options: (q.options ?? []).map(stripOptionLabel),
    correct_answer: (q.correct_answer ?? "").trim(),
    solution: q.solution ?? "",
    difficulty: q.difficulty,
  }));

  // Grading compares the student's selected option text against
  // correct_answer, so an MCQ whose correct_answer isn't one of its options
  // can never be answered correctly. Repair the common case (the model
  // answered with a letter label like "B") and drop anything still
  // ungradeable rather than shipping a question that is always marked wrong.
  return mapped
    .map((q) => (q.type === "mcq_single" ? repairMcqAnswer(q) : q))
    .filter((q) => {
      if (!q.question_text || !q.correct_answer) return false;
      if (q.type !== "mcq_single") return true;
      return q.options.length > 0 && q.options.includes(q.correct_answer);
    });
}

// Models sometimes prefix options with their label ("A) 9.8 m/s²"); the UI
// renders options as-is, and grading matches on exact text, so normalize.
function stripOptionLabel(option: string): string {
  return option.trim().replace(/^\(?[A-Da-d][)\].:]\s+/, "").trim();
}

// Some models echo the scaffolding from the prompt into the question itself
// (e.g. "Topic 0 - Easy (MCQ): The gravitational force..."). Prefixes can be
// stacked, so strip repeatedly until nothing more matches.
const SCAFFOLD_PREFIXES = [
  /^Topic\s*\d+\s*[-–—:]\s*/i,
  // Combined forms like "Easy (MCQ):" / "Hard (numerical) -"
  /^(?:easy|medium|hard)\s*\((?:MCQ|numerical)\)\s*[-–—:]?\s*/i,
  /^\((?:easy|medium|hard)\)\s*[-–—:]?\s*/i,
  /^(?:easy|medium|hard)\s*[-–—:]\s*/i,
  /^\((?:MCQ|numerical)\)\s*[-–—:]?\s*/i,
  /^(?:MCQ|numerical)\s*[-–—:]\s*/i,
  /^Q\s*\d*\s*[-–—.:]\s*/i,
];

function cleanQuestionText(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 6; pass++) {
    const before = out;
    for (const pattern of SCAFFOLD_PREFIXES) {
      out = out.replace(pattern, "").trim();
    }
    if (out === before) break;
  }
  return out;
}

// If correct_answer came back as a bare option label ("B", "(b)", "Option C")
// instead of the option's text, resolve it to the actual option.
function repairMcqAnswer<T extends { options: string[]; correct_answer: string }>(
  q: T,
): T {
  if (q.options.includes(q.correct_answer)) return q;

  const letter = q.correct_answer
    .trim()
    .replace(/^option\s+/i, "")
    .replace(/[()\].:]/g, "")
    .trim();

  if (/^[A-Da-d]$/.test(letter)) {
    const index = letter.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < q.options.length) {
      return { ...q, correct_answer: q.options[index] };
    }
  }

  // Fall back to a case-insensitive text match before giving up.
  const match = q.options.find(
    (o) => o.toLowerCase() === q.correct_answer.toLowerCase(),
  );
  return match ? { ...q, correct_answer: match } : q;
}
