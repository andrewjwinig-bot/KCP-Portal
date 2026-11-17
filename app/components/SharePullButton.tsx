"use client";

// The folder icon beside an import: pulls that report's newest file straight
// from the synced share drive and hands it to the page's own import, exactly
// as if it had been picked (Chrome / Edge; hidden elsewhere).

import { useEffect, useState, type RefObject } from "react";
import { FolderSync } from "lucide-react";
import { feedInput } from "./pickFiles";
import { folderAccessSupported, pullFromShare } from "./shareFolder";
import { HoverCard } from "./HoverCard";
import type { PullSpec } from "@/lib/shareDrive/pullSpecs";

export function SharePullButton({ input, spec, disabled, year }: { input: RefObject<HTMLInputElement | null>; spec: PullSpec; disabled?: boolean; year?: number }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setOk(folderAccessSupported()), []);
  if (!ok) return null;
  const tip = `Pull ${spec.what} from the Share Drive`;
  const run = async () => {
    setBusy(true); setProblem(null);
    try {
      const r = await pullFromShare(spec, year);
      if (r) feedInput(input.current, r.files);
    } catch (e) {
      setProblem((e as Error).message);
    } finally { setBusy(false); }
  };
  const btn = (
    <button type="button" className="btn icon-tip" disabled={disabled || busy} onClick={run} aria-label={tip} data-tip={problem ? undefined : tip}>
      <FolderSync size={16} strokeWidth={1.75} aria-hidden color={problem ? "var(--c-b42318, #B42318)" : undefined} />
    </button>
  );
  return problem ? <HoverCard title="Couldn't pull from the Share Drive" rows={[]} body={<div style={{ maxWidth: 320 }}>{problem}</div>} width={340}>{btn}</HoverCard> : btn;
}
