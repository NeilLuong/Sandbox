// Rebuilds docs/problems.json (number -> title, difficulty, LeetCode tags) used
// to auto-fill the form. LeetCode's own API blocks scripted access, so this
// reads the problem table maintained at github.com/doocs/leetcode instead.
//
// Usage: node scripts/update-problems.mjs [path-or-url-to-README_EN.md]

import { readFile, writeFile } from "node:fs/promises";

const SOURCE =
  process.argv[2] ??
  "https://raw.githubusercontent.com/doocs/leetcode/main/solution/README_EN.md";
const OUT = new URL("../docs/problems.json", import.meta.url);
const DIFFICULTY = { Easy: 0, Medium: 1, Hard: 2 };

const markdown = SOURCE.startsWith("http")
  ? await fetch(SOURCE).then((res) => {
      if (!res.ok) throw new Error(`GET ${SOURCE} -> ${res.status}`);
      return res.text();
    })
  : await readFile(SOURCE, "utf8");

// |  0001  |  [Two Sum](/solution/...)  |  `Array`,`Hash Table`  |  Easy  |  ...
const ROW = /^\|\s*(\d+)\s*\|\s*\[(.+)\]\(\/solution\/[^)]*\)\s*\|([^|]*)\|\s*(Easy|Medium|Hard)\s*\|/;

const rows = [];
const tagCounts = new Map();
for (const line of markdown.split("\n")) {
  const m = ROW.exec(line);
  if (!m) continue;
  const tags = [...m[3].matchAll(/`([^`]+)`/g)].map((t) => t[1]);
  for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  rows.push({ number: Number(m[1]), title: m[2], difficulty: DIFFICULTY[m[4]], tags });
}
if (rows.length < 1000) {
  throw new Error(`Only parsed ${rows.length} problems; the source format may have changed.`);
}

// Store tags once, most common first, and reference them by index per problem.
const tagList = [...tagCounts.keys()].sort((a, b) => tagCounts.get(b) - tagCounts.get(a));
const tagIndex = new Map(tagList.map((t, i) => [t, i]));

const data = {
  source: "https://github.com/doocs/leetcode",
  updated: new Date().toISOString().slice(0, 10),
  tags: tagList,
  // [number, title, difficulty (0 Easy, 1 Medium, 2 Hard), [tag indexes]]
  problems: rows.map((r) => [r.number, r.title, r.difficulty, r.tags.map((t) => tagIndex.get(t))]),
};

await writeFile(OUT, JSON.stringify(data) + "\n");
console.log(`Wrote ${rows.length} problems and ${tagList.length} tags to docs/problems.json`);
