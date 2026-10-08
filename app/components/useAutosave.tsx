"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_FLASH_MS = 1400;

/**
 * Debounced autosave with "Saving… / ✓ Saved" status. Call `schedule`
 * after each user edit with the latest snapshot; the hook will batch
 * rapid edits behind a debounce and surface saving / saved / error state.
 *
 * On unmount, a queued save is flushed via `keepalive` (provided by the
 * caller) so navigating away mid-edit doesn't drop the last keystroke.
 *
 * Used by CamConfigCard, ContactsCard, SuiteInformationCard.
 */
export function useAutosave<T>(opts: {
  /** Persist a snapshot. Throw to surface an error in `error`. */
  save: (snapshot: T) => Promise<void>;
  /** Synchronous flush used on unmount when a save is still queued.
   *  Implement with `fetch(url, { method, body, keepalive: true })`. */
  keepalive?: (snapshot: T) => void;
  debounceMs?: number;
  flashMs?: number;
}) {
  const { save, keepalive, debounceMs = DEFAULT_DEBOUNCE_MS, flashMs = DEFAULT_FLASH_MS } = opts;
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = useRef<T | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest callbacks in refs so the cleanup effect doesn't have
  // to depend on them (and tear down the keepalive flush every render).
  const saveRef = useRef(save);
  const keepaliveRef = useRef(keepalive);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { keepaliveRef.current = keepalive; }, [keepalive]);

  async function flush() {
    const snap = latest.current;
    if (snap == null) return;
    setSaving(true);
    setError(null);
    try {
      await saveRef.current(snap);
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), flashMs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function schedule(snapshot: T) {
    latest.current = snapshot;
    setSavedFlash(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flush(); }, debounceMs);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (latest.current != null && keepaliveRef.current) {
          keepaliveRef.current(latest.current);
        }
      }
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  return { saving, savedFlash, error, schedule };
}

/** Compact pill that renders the autosave status next to a card's title. */
export function AutosaveStatus({ saving, savedFlash }: { saving: boolean; savedFlash: boolean }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", minHeight: 14 }}>
      {saving ? "Saving…" : savedFlash ? <span style={{ color: "#15803d" }}>✓ Saved</span> : ""}
    </span>
  );
}
