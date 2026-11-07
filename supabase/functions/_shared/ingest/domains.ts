/**
 * Domain from a job title, for sources that don't label their listings
 * (Greenhouse and Lever boards). First matching rule wins, so the more
 * specific rules come first.
 */
import type { Domain } from "./job.ts";

const RULES: readonly (readonly [RegExp, Domain])[] = [
  [/\b(legal|law|lawyer|attorney|paralegal|litigation|counsel)\b/i, "law"],
  [
    /\b(medic(al|ine)|clinical|physician|doctor|nurs(e|ing)|pharma\w*|dental|dentist|radiolog\w*|patholog\w*|psychiatr\w*|health ?care|surgeon|veterinar\w*|antibiotic\w*|microbiolog\w*|epidemiolog\w*|immunolog\w*|pathogen\w*|virus\w*|viruses|drug discovery|health technicians?)\b/i,
    "medicine",
  ],
  [
    /\b(financ\w*|accounting|accountant|actuar\w*|tax|banking|investment|economics|economist|audit\w*|cpa|payroll|retirement plan\w*|insurance|securities|commodities)\b/i,
    "finance",
  ],
  [
    /\b(machine learning|ml engineer|deep learning|computer vision|generative ai|llm|prompt engineer\w*|ai research\w*)\b/i,
    "ai-ml",
  ],
  [
    /\b(software|developer|coding|coder|programm\w*|python|javascript|typescript|java|c\+\+|rust|golang|swe|full[- ]?stack|front[- ]?end|back[- ]?end|devops|web dev\w*|computer|information systems|cybersecurity|database|sdet|latex)\b/i,
    "software",
  ],
  [/\b(data scien\w*|data analy\w*|statistic\w*|sql|analytics)\b/i, "data"],
  [/\b(robot\w*)\b/i, "robotics"],
  [
    /\b(engineer(ing)?|mechanical|electrical|civil|chemical engineer\w*|aerospace)\b/i,
    "engineering",
  ],
  [
    /\b(math\w*|physic\w*|chemi\w*|biolog\w*|scien\w*|astronom\w*|geolog\w*|geospatial|neuroscien\w*|psycholog\w*|stem)\b/i,
    "science",
  ],
  [
    /\b(translat\w*|linguist\w*|language|locali[sz]\w*|transcri\w*|voice|speech|audio|accent|dialect|search quality|search engine|ads quality|rater|bilingual|trilingual|trainers network|talent hub|speakers)\b/i,
    "language",
  ],
  [
    /\b(design\w*|artist|art|3d|animat\w*|illustrat\w*|music\w*|video|photo\w*|film)\b/i,
    "arts-design",
  ],
  [/\b(teach\w*|educat\w*|curricul\w*|instructor)\b/i, "education"],
  [
    /\b(history|philosoph\w*|literature|writ(er|ing)|journalis\w*|humanities|creative|anthropolog\w*|sociolog\w*|politic\w*|religion|culture|sports)\b/i,
    "humanities",
  ],
  [/\b(marketing|sales|seo|advertis\w*|social media)\b/i, "sales-marketing"],
  [
    /\b(business|consult\w*|operations|management|strategy|executives?|hr|human resources?|customer support|secretar\w*|administrative|manufacturing|real estate|government|online ordering|product matching)\b/i,
    "business",
  ],
  [
    /\b(electrician|plumb\w*|carpent\w*|mechanic|construction|hvac|trades?)\b/i,
    "trades",
  ],
  [/\b(generalist|general application|no experience)\b/i, "generalist"],
];

/**
 * The best-fitting domain for a title. A title that otherwise only names a
 * language (as in "AI Tutor - Arabic" or "AI Trainers Network - English")
 * is language work.
 */
export function classifyDomain(
  title: string,
  languages: readonly string[],
): Domain {
  for (const [pattern, domain] of RULES) {
    if (pattern.test(title)) return domain;
  }
  return languages.length > 0 ? "language" : "other";
}
