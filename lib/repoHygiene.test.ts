import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * No unresolved merge conflict lands in a committed file.
 *
 * This exists because one did. A merge on a branch that had already been
 * squash-merged conflicted in five files; `git checkout --ours` resolved the
 * four git listed, but a fifth — an API route — carried two conflict blocks
 * that `git add -A` then staged verbatim. `tsc` caught it and the test suite
 * did not, because no test imports a route file, so the broken tree was pushed
 * and Vercel failed the preview build.
 *
 * A type error is the wrong net for this: it only catches markers in files the
 * compiler reaches, and says nothing about a conflicted .json, .css or .md.
 * Scanning the tracked tree costs milliseconds and catches all of them.
 */
describe("no unresolved merge conflicts", () => {
  it("no tracked source file contains conflict markers", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|yml|yaml)$/.test(f));

    expect(files.length).toBeGreaterThan(100); // the scan actually looked at the repo

    const offenders: string[] = [];
    for (const file of files) {
      if (file === "lib/repoHygiene.test.ts") continue; // it names the markers in prose
      let text: string;
      try { text = readFileSync(file, "utf8"); } catch { continue; }
      // Only the opening and closing markers: a bare row of "=" is a legitimate
      // setext heading in Markdown, and flagging it would make this cry wolf.
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (/^<{7}(\s|$)/.test(line) || /^>{7}(\s|$)/.test(line)) offenders.push(`${file}:${i + 1}  ${line.slice(0, 60)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
