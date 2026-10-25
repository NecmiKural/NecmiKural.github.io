// Copy check over every file in the repo and in dist/: em and en dashes, generic banned phrases,
// email and phone patterns, and private terms. Private terms come from the PRIVATE_TERMS secret
// (one per line) or a gitignored .private-terms file, and are reported by number, never by text.
//   node scripts/check-copy.ts [--self-test]

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Figure, en and em dashes, horizontal bar, two and three em dashes, and their HTML entities;
// built from code points so this file passes its own check.
const cp = String.fromCodePoint;
const DASH = new RegExp(
  `[${cp(0x2012)}-${cp(0x2015)}${cp(0x2e3a)}${cp(0x2e3b)}]|&[mn]dash;|&#821[12];|&#x201[34];`,
  "i",
);
// The generic list from scripts/portfolio.py in NecmiKural/NecmiKural; names and numbers that
// must never appear live only in PRIVATE_TERMS.
const BANNED = [
  "production", "injection-proof", "robust", "deployed on aws", "runs on rds", "saves 58%",
  "worse model", "graduated", "seasonal drift", "zero context loss", "passionate", "expert",
  "cutting-edge", "state-of-the-art", "seamless", "world-class", "powerful",
];
const PII = [/[\w.+-]+@[\w-]+\.[\w.]+/, /\+?\d[\d ()]{8,}\d/];
const NOT_PII = /https?:\/\/[^\s)"'<>]+|\b[0-9a-f]{40}\b|\bsha\d+-[\w+/=]+/g; // links, SHAs, hashes
// Files that hold the banned list itself, or integrity hashes, skip the phrase and PII rules.
// SVG path data reads as phone numbers, so SVGs skip the PII rule only.
const PATTERN_FILES = new Set(["scripts/check-copy.ts", "package-lock.json"]);
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?)$/i;

const phrase = (p: string) => new RegExp(`(?<!\\w)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w)`, "i");

export function lint(text: string, where: string, terms: string[], phrases = true, pii = phrases): string[] {
  const banned = BANNED.map((p) => [p, phrase(p)] as const);
  const privates = terms.map((t, i) => [i + 1, phrase(t)] as const);
  const found: string[] = [];
  text.split("\n").forEach((line, i) => {
    const say = (msg: string) => found.push(`${where}:${i + 1}: ${msg}`);
    if (DASH.test(line)) say("em or en dash");
    for (const [n, rx] of privates) if (rx.test(line)) say(`private term #${n}`);
    if (phrases) for (const [p, rx] of banned) if (rx.test(line)) say(`banned phrase '${p}'`);
    if (pii && PII.some((rx) => rx.test(line.replace(NOT_PII, "")))) say("looks like an email address or phone number");
  });
  return found;
}

function privateTerms(): string[] {
  let raw = process.env.PRIVATE_TERMS ?? "";
  if (!raw.trim() && existsSync(".private-terms")) raw = readFileSync(".private-terms", "utf8");
  const terms = raw.split("\n").map((t) => t.trim()).filter((t) => t && !t.startsWith("#"));
  if (!terms.length) {
    if (process.env.CI) {
      console.error("PRIVATE_TERMS is empty: set the secret (one term per line)");
      process.exit(1);
    }
    console.log("note: no private terms loaded (.private-terms or PRIVATE_TERMS); not checked");
  }
  return terms;
}

function files(): string[] {
  const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" });
  const built = existsSync("dist")
    ? readdirSync("dist", { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => join(d.parentPath, d.name))
    : [];
  return [...tracked.split("\n").filter(Boolean), ...built].filter((f) => !BINARY.test(f) && existsSync(f));
}

function selfTest(): void {
  const t = (text: string, terms: string[] = []) => lint(text, "f", terms);
  const eq = (got: string[], want: string[]) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  eq(t(`a ${cp(0x2014)} b`), ["f:1: em or en dash"]);
  eq(t(`a ${cp(0x2013)} b`), ["f:1: em or en dash"]);
  eq(t("a &" + "mdash; b"), ["f:1: em or en dash"]);
  eq(t("ok\nready for Production"), ["f:2: banned phrase 'production'"]);
  eq(t("ask the experts"), []);
  eq(t("mail me at a.b@example.org"), ["f:1: looks like an email address or phone number"]);
  eq(t("call +64 21 555 0199"), ["f:1: looks like an email address or phone number"]);
  eq(t("https://github.com/x/y/blob/0123456789abcdef0123456789abcdef01234567/README.md"), []);
  eq(t("worked at Acme Widgets", ["acme widgets"]), ["f:1: private term #1"]);
  eq(lint("Acme production", "f", ["acme"], false), ["f:1: private term #1"]);
  eq(lint("M0 0h1234567890", "f.svg", [], true, false), []);
  console.log("check-copy self-test: ok");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const terms = privateTerms();
  const all = files();
  const found = all.flatMap((f) => {
    const phrases = !PATTERN_FILES.has(f);
    return lint(readFileSync(f, "utf8"), f, terms, phrases, phrases && !f.endsWith(".svg"));
  });
  for (const line of found) console.error(line);
  console.log(`check-copy: ${all.length} files, ${terms.length} private terms, ${found.length} problems`);
  process.exit(found.length ? 1 : 0);
}
