// Built-in phrase dictionary — curated fallback entries for common English
// phrases, phrasal verbs, and expressions that free dictionary APIs handle
// poorly. Used by lib/dictionary.ts: first source for phrase definitions and
// the guaranteed exact-phrase example source.

export interface LocalPhraseEntry {
  phrase: string;
  definition: string;
  example: string;
  type: "phrase" | "phrasal verb" | "idiom" | "expression" | "noun phrase";
  synonyms?: string[];
  notes?: string;
}

export const LOCAL_PHRASES: LocalPhraseEntry[] = [
  {
    phrase: "winning formula",
    definition: "A method, plan, or combination of things that produces successful results.",
    example: "After several failed attempts, we finally found a winning formula for improving our study routine.",
    type: "noun phrase",
    synonyms: ["recipe for success", "winning combination"],
  },
  {
    phrase: "get rid of",
    definition: "To remove, throw away, or stop having something unwanted.",
    example: "I need to get rid of old files to free up space on my laptop.",
    type: "phrasal verb",
    synonyms: ["remove", "discard", "dispose of"],
  },
  {
    phrase: "look forward to",
    definition: "To feel happy or excited about something that will happen in the future.",
    example: "I look forward to hearing your feedback after the meeting.",
    type: "phrasal verb",
    synonyms: ["anticipate", "await"],
    notes: "Followed by a noun or the -ing form: “look forward to seeing you”.",
  },
  {
    phrase: "come up with",
    definition: "To think of or suggest an idea, plan, or solution.",
    example: "We need to come up with a better way to track our daily tasks.",
    type: "phrasal verb",
    synonyms: ["devise", "think up", "invent"],
  },
  {
    phrase: "figure out",
    definition: "To understand or solve something after thinking about it.",
    example: "I finally figured out why the build was failing.",
    type: "phrasal verb",
    synonyms: ["work out", "solve", "understand"],
  },
  {
    phrase: "take care of",
    definition: "To deal with, manage, or look after someone or something.",
    example: "I will take care of the report before the end of the day.",
    type: "phrasal verb",
    synonyms: ["handle", "look after", "manage"],
  },
  {
    phrase: "deal with",
    definition: "To handle, manage, or take action about a problem, task, or situation.",
    example: "The team needs to deal with the clash before submitting the model.",
    type: "phrasal verb",
    synonyms: ["handle", "manage", "address"],
  },
  {
    phrase: "carry out",
    definition: "To do or complete a task, plan, test, or instruction.",
    example: "We need to carry out a final review before sending the files.",
    type: "phrasal verb",
    synonyms: ["perform", "execute", "conduct"],
  },
  {
    phrase: "point out",
    definition: "To mention or show something important.",
    example: "The consultant pointed out a mismatch between the label and the layout.",
    type: "phrasal verb",
    synonyms: ["mention", "highlight", "indicate"],
  },
  {
    phrase: "rely on",
    definition: "To depend on someone or something.",
    example: "The app should not rely on one API for phrase definitions.",
    type: "phrasal verb",
    synonyms: ["depend on", "count on", "trust"],
  },
  {
    phrase: "run into",
    definition: "To experience or meet a problem unexpectedly.",
    example: "I ran into a TypeScript error during the production build.",
    type: "phrasal verb",
    synonyms: ["encounter", "come across"],
  },
  {
    phrase: "set up",
    definition: "To prepare, arrange, or create something so it is ready to use.",
    example: "I need to set up the project before testing the new feature.",
    type: "phrasal verb",
    synonyms: ["prepare", "arrange", "establish"],
  },
  {
    phrase: "break down",
    definition: "To divide something into smaller parts to make it easier to understand.",
    example: "The dashboard breaks down my weak words by tag and difficulty.",
    type: "phrasal verb",
    synonyms: ["divide", "split up", "analyze"],
    notes: "Also means “to stop working” (a car breaks down) or “to lose emotional control”.",
  },
  {
    phrase: "keep track of",
    definition: "To continue to know or record what is happening with something.",
    example: "LexiGlass helps me keep track of my English progress.",
    type: "phrase",
    synonyms: ["monitor", "follow", "record"],
  },
  {
    phrase: "make sure",
    definition: "To check or do something so that another thing definitely happens.",
    example: "Make sure the example sentence includes the target phrase.",
    type: "phrase",
    synonyms: ["ensure", "verify", "confirm"],
  },
];

// Curated example sentences for common single study words whose API examples
// tend to be weak or missing. Only consulted when API results are poor.
export const LOCAL_WORD_EXAMPLES: Record<string, string[]> = {
  restrict: [
    "The company restricts access to sensitive project files.",
    "Doctors often advise patients to restrict sugar intake.",
    "The school restricts phone use during class.",
  ],
  absolutely: [
    "The weather today is absolutely terrible.",
    "I am absolutely sure this is the correct answer.",
    "The presentation was absolutely brilliant.",
  ],
  quite: [
    "The task was quite difficult, but I managed to finish it.",
    "She speaks English quite well.",
    "The meeting was quite useful.",
  ],
};

const PHRASES_BY_KEY = new Map(LOCAL_PHRASES.map((e) => [e.phrase, e]));

/** Exact-match lookup by normalized term key (lowercased, spaces collapsed). */
export function findLocalPhrase(normalizedKey: string): LocalPhraseEntry | null {
  return PHRASES_BY_KEY.get(normalizedKey) ?? null;
}

/** Curated example sentences for a single word, or [] if we have none. */
export function findLocalWordExamples(normalizedKey: string): string[] {
  return LOCAL_WORD_EXAMPLES[normalizedKey] ?? [];
}
