// Built-in grammar question bank. Used to fill grammar quizzes alongside
// questions generated from the user's own saved grammar topics.
// No external API is required, so no secret keys are involved.

import type { GrammarQuestionType } from "./types";

export interface BankQuestion {
  topic: string; // used to match against the user's saved topic titles/tags
  type: GrammarQuestionType;
  prompt: string;
  context?: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export const GRAMMAR_BANK: BankQuestion[] = [
  // ---- Present simple / continuous ----
  {
    topic: "present simple",
    type: "mcq",
    prompt: "Choose the correct form: She _____ to work every day.",
    options: ["go", "goes", "going", "is go"],
    answer: "goes",
    explanation: "Third person singular (he/she/it) takes -s in the present simple.",
  },
  {
    topic: "present simple",
    type: "find_mistake",
    prompt: "Which part of this sentence is wrong? “He don't like coffee.”",
    options: ["He", "don't", "like", "coffee"],
    answer: "don't",
    explanation: "With he/she/it use “doesn't”: He doesn't like coffee.",
  },
  {
    topic: "present continuous",
    type: "mcq",
    prompt: "Choose the correct form: Listen! The baby _____.",
    options: ["cries", "cry", "is crying", "crying"],
    answer: "is crying",
    explanation: "An action happening right now uses the present continuous (am/is/are + -ing).",
  },
  {
    topic: "present continuous",
    type: "choose_correct",
    prompt: "Choose the correct sentence:",
    options: [
      "I am knowing the answer.",
      "I know the answer.",
      "I knowing the answer.",
      "I am know the answer.",
    ],
    answer: "I know the answer.",
    explanation: "State verbs like know, like, want are not normally used in the continuous form.",
  },
  // ---- Past tenses ----
  {
    topic: "past simple",
    type: "fill_blank",
    prompt: "Type the past simple of “buy”: Yesterday I _____ a new phone.",
    answer: "bought",
    explanation: "“Buy” is irregular: buy → bought → bought.",
  },
  {
    topic: "past simple",
    type: "choose_correct",
    prompt: "Choose the correct sentence:",
    options: [
      "Did you went to the party?",
      "Did you go to the party?",
      "Do you went to the party?",
      "You did went to the party?",
    ],
    answer: "Did you go to the party?",
    explanation: "After the auxiliary “did”, use the base form of the verb.",
  },
  {
    topic: "past continuous",
    type: "mcq",
    prompt: "While I _____ dinner, the phone rang.",
    options: ["cooked", "was cooking", "am cooking", "cook"],
    answer: "was cooking",
    explanation: "A longer background action interrupted by a shorter one uses the past continuous.",
  },
  // ---- Present perfect ----
  {
    topic: "present perfect",
    type: "mcq",
    prompt: "I _____ this movie three times.",
    options: ["saw", "have seen", "see", "am seeing"],
    answer: "have seen",
    explanation: "Life experience up to now (with a result in the present) uses the present perfect.",
  },
  {
    topic: "present perfect",
    type: "find_mistake",
    prompt: "Which part is wrong? “She has went to London twice.”",
    options: ["She", "has", "went", "twice"],
    answer: "went",
    explanation: "The present perfect needs the past participle: She has gone to London twice.",
  },
  {
    topic: "present perfect",
    type: "mcq",
    prompt: "We have lived here _____ 2015.",
    options: ["for", "since", "from", "during"],
    answer: "since",
    explanation: "“Since” + a starting point (2015); “for” + a length of time (nine years).",
  },
  // ---- Future ----
  {
    topic: "future",
    type: "mcq",
    prompt: "Look at those clouds! It _____ rain.",
    options: ["will", "is going to", "would", "shall"],
    answer: "is going to",
    explanation: "A prediction based on present evidence uses “going to”.",
  },
  {
    topic: "future",
    type: "choose_correct",
    prompt: "Choose the correct sentence:",
    options: [
      "I will call you when I will arrive.",
      "I will call you when I arrive.",
      "I call you when I will arrive.",
      "I will call you when I arriving.",
    ],
    answer: "I will call you when I arrive.",
    explanation: "After time words (when, after, before, until) use the present simple, not “will”.",
  },
  // ---- Articles ----
  {
    topic: "articles",
    type: "mcq",
    prompt: "She is _____ honest person.",
    options: ["a", "an", "the", "(no article)"],
    answer: "an",
    explanation: "“Honest” starts with a vowel sound (the h is silent), so use “an”.",
  },
  {
    topic: "articles",
    type: "find_mistake",
    prompt: "Which part is wrong? “I love the nature in spring.”",
    options: ["love", "the", "nature", "spring"],
    answer: "the",
    explanation: "General uncountable ideas like “nature” take no article: I love nature.",
  },
  {
    topic: "articles",
    type: "mcq",
    prompt: "He plays _____ guitar very well.",
    options: ["a", "an", "the", "(no article)"],
    answer: "the",
    explanation: "Musical instruments usually take “the”: play the guitar, play the piano.",
  },
  // ---- Prepositions ----
  {
    topic: "prepositions",
    type: "mcq",
    prompt: "The meeting is _____ Monday _____ 9 a.m.",
    options: ["in / at", "on / at", "at / on", "on / in"],
    answer: "on / at",
    explanation: "Days take “on” (on Monday); clock times take “at” (at 9 a.m.).",
  },
  {
    topic: "prepositions",
    type: "fill_blank",
    prompt: "Type the missing preposition: I'm really interested _____ history.",
    answer: "in",
    explanation: "“Interested” is always followed by “in”.",
  },
  {
    topic: "prepositions",
    type: "find_mistake",
    prompt: "Which part is wrong? “She is married with a doctor.”",
    options: ["She", "is", "married", "with"],
    answer: "with",
    explanation: "In English you are married “to” someone: She is married to a doctor.",
  },
  // ---- Comparatives / superlatives ----
  {
    topic: "comparatives",
    type: "mcq",
    prompt: "This exam was _____ than the last one.",
    options: ["more easy", "easier", "easiest", "more easier"],
    answer: "easier",
    explanation: "Short adjectives form the comparative with -er: easy → easier.",
  },
  {
    topic: "comparatives",
    type: "choose_correct",
    prompt: "Choose the correct sentence:",
    options: [
      "It was the most bad movie I've ever seen.",
      "It was the worst movie I've ever seen.",
      "It was the baddest movie I've ever seen.",
      "It was the more bad movie I've ever seen.",
    ],
    answer: "It was the worst movie I've ever seen.",
    explanation: "“Bad” is irregular: bad → worse → the worst.",
  },
  // ---- Conditionals ----
  {
    topic: "conditionals",
    type: "mcq",
    prompt: "If it rains tomorrow, we _____ at home.",
    options: ["stay", "will stay", "would stay", "stayed"],
    answer: "will stay",
    explanation: "First conditional: If + present simple, will + base verb.",
  },
  {
    topic: "conditionals",
    type: "mcq",
    prompt: "If I _____ rich, I would travel the world.",
    options: ["am", "was", "were", "will be"],
    answer: "were",
    explanation: "Second conditional (imaginary present): If + past simple; “were” is used for all persons.",
  },
  {
    topic: "conditionals",
    type: "find_mistake",
    prompt: "Which part is wrong? “If I would have money, I would buy it.”",
    options: ["If", "would have", "money", "buy"],
    answer: "would have",
    explanation: "Never use “would” in the if-clause: If I had money, I would buy it.",
  },
  // ---- Modals ----
  {
    topic: "modals",
    type: "mcq",
    prompt: "You _____ smoke in the hospital. It's forbidden.",
    options: ["mustn't", "don't have to", "shouldn't", "may not"],
    answer: "mustn't",
    explanation: "“Mustn't” = prohibition; “don't have to” = no obligation (it's optional).",
  },
  {
    topic: "modals",
    type: "choose_correct",
    prompt: "Choose the correct sentence:",
    options: [
      "She can to swim very fast.",
      "She cans swim very fast.",
      "She can swims very fast.",
      "She can swim very fast.",
    ],
    answer: "She can swim very fast.",
    explanation: "Modal verbs (can, must, should…) are followed by the base form without “to”.",
  },
  {
    topic: "modals",
    type: "correct_sentence",
    prompt: "Correct this sentence: “You should to see a doctor.”",
    answer: "You should see a doctor.",
    explanation: "“Should” is a modal verb, so no “to” before the main verb.",
  },
  // ---- Passive voice ----
  {
    topic: "passive",
    type: "mcq",
    prompt: "This bridge _____ in 1932.",
    options: ["built", "was built", "is build", "was build"],
    answer: "was built",
    explanation: "Passive voice: be + past participle. Past event → was/were + built.",
  },
  {
    topic: "passive",
    type: "choose_correct",
    prompt: "Choose the correct passive sentence:",
    options: [
      "English is spoken all over the world.",
      "English is speak all over the world.",
      "English spoken all over the world.",
      "English is spoke all over the world.",
    ],
    answer: "English is spoken all over the world.",
    explanation: "Passive = be + past participle: speak → spoken.",
  },
  // ---- Countable / uncountable ----
  {
    topic: "countable nouns",
    type: "mcq",
    prompt: "There isn't _____ milk in the fridge.",
    options: ["many", "much", "a few", "some of"],
    answer: "much",
    explanation: "“Milk” is uncountable → use “much” in negatives; “many” is for countable nouns.",
  },
  {
    topic: "countable nouns",
    type: "find_mistake",
    prompt: "Which part is wrong? “She gave me many good advices.”",
    options: ["gave", "many", "advices", "good"],
    answer: "advices",
    explanation: "“Advice” is uncountable and has no plural: some advice / a piece of advice.",
  },
  // ---- Gerunds and infinitives ----
  {
    topic: "gerunds and infinitives",
    type: "mcq",
    prompt: "I enjoy _____ books in the evening.",
    options: ["read", "to read", "reading", "reads"],
    answer: "reading",
    explanation: "“Enjoy” is always followed by a gerund (-ing form).",
  },
  {
    topic: "gerunds and infinitives",
    type: "mcq",
    prompt: "She decided _____ a new language.",
    options: ["learning", "to learn", "learn", "learned"],
    answer: "to learn",
    explanation: "“Decide” is followed by the infinitive with “to”.",
  },
  {
    topic: "gerunds and infinitives",
    type: "correct_sentence",
    prompt: "Correct this sentence: “I look forward to hear from you.”",
    answer: "I look forward to hearing from you.",
    explanation: "In “look forward to”, the “to” is a preposition, so it takes -ing.",
  },
  // ---- Question formation ----
  {
    topic: "questions",
    type: "choose_correct",
    prompt: "Choose the correct question:",
    options: [
      "Where you are going?",
      "Where are you going?",
      "Where you going?",
      "Where going you are?",
    ],
    answer: "Where are you going?",
    explanation: "Questions invert the subject and auxiliary: question word + auxiliary + subject + verb.",
  },
  {
    topic: "questions",
    type: "correct_sentence",
    prompt: "Correct this question: “What time the train leaves?”",
    answer: "What time does the train leave?",
    explanation: "Present simple questions need the auxiliary “do/does” before the subject.",
  },
  // ---- Relative clauses ----
  {
    topic: "relative clauses",
    type: "mcq",
    prompt: "The woman _____ lives next door is a doctor.",
    options: ["which", "who", "whom", "whose"],
    answer: "who",
    explanation: "“Who” refers to people as the subject of a relative clause.",
  },
  {
    topic: "relative clauses",
    type: "mcq",
    prompt: "That's the boy _____ bike was stolen.",
    options: ["who", "which", "whose", "that"],
    answer: "whose",
    explanation: "“Whose” shows possession: the boy's bike → the boy whose bike…",
  },
  // ---- Reported speech ----
  {
    topic: "reported speech",
    type: "mcq",
    prompt: "She said she _____ tired.",
    options: ["is", "was", "be", "were being"],
    answer: "was",
    explanation: "In reported speech after a past reporting verb, the tense moves back: “I am tired” → she was tired.",
  },
  {
    topic: "reported speech",
    type: "correct_sentence",
    prompt: "Correct this sentence: “He asked me where do I live.”",
    answer: "He asked me where I live.",
    explanation: "Reported questions use normal word order without the auxiliary “do”.",
  },
];
