// A label that shortens itself when there is no room — the shared list in
// lib/ui/abbrev.ts. Both forms are rendered; CSS shows the short one when the
// nearest `abbr-scope` (a statement card) or tile is narrow. The full name is
// the hover on the short form, so nothing is lost.
import { abbrev } from "@/lib/ui/abbrev";

export function Abbr({ text }: { text: string }) {
  const short = abbrev(text);
  if (short === text) return <>{text}</>;
  return (
    <>
      <span className="ab-full">{text}</span>
      <span className="ab-short" title={text}>{short}</span>
    </>
  );
}
