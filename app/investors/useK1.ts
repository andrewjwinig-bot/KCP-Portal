"use client";

// K-1 state for the Investor Info page, held ONE level up from the property
// cards.
//
// Why a registry rather than a hook inside each card: the K-1 columns live in
// the ownership table itself (one table, not two that repeat owner / vendor code
// / share), and that table is rendered from a `.map` inside the page component.
// A hook can't be called from there. So the page calls this once, and each card
// reads its own slice.
//
// Data loads lazily — only for a K-1 partnership whose card is actually open —
// so opening Investor Info doesn't fetch every partnership's documents.

import { useCallback, useEffect, useRef, useState } from "react";
import type { K1Document } from "@/lib/investors/k1";

export type K1Owner = {
  id: string; name: string; detailedName: string | null; vendorCode: string | null;
  ownerPct: number | null; sharesName: boolean;
  /** Where their link would be emailed, and where that address came from. */
  email: string | null; emailSource: string; emailNote: string;
  /** The live link, including the URL and PIN so the roster can show and copy
   *  exactly what the investor holds. Re-signed from the stored link — reading
   *  it mints nothing. */
  link: {
    id: string; createdAt: string; viewCount: number; lastViewedAt: string | null;
    url?: string | null; pin?: string | null;
  } | null;
};

export type K1Payload = { ok: true; years: number[]; owners: K1Owner[]; documents: K1Document[]; blockers: string[] };

/** One owner's outcome from a share. The bulk and single paths return the same
 *  shape, so the result panel doesn't branch. */
export type ShareResult = {
  ownerId: string;
  ownerName: string;
  /** Trust / detailed name — the disambiguator when one person holds two. */
  heldAs?: string | null;
  url?: string;
  pin?: string;
  sentTo: string[];
  mailError: string | null;
  error?: string;
};

export type ShareBatch = { key: string; sent: boolean; results: ShareResult[] };

/** One interest a person holds, with its documents — the By Investor shape. */
export type K1Interest = {
  ownerId: string; propertyCode: string; propertyName: string; filesK1: boolean;
  heldAs: string | null; vendorCode: string | null;
  email: string | null; emailSource: string; emailNote: string;
  documents: { id: string; taxYear: number; filename: string; published: boolean; viewCount: number }[];
  link: {
    id: string; createdAt: string; viewCount: number; lastViewedAt: string | null;
    url?: string | null; pin?: string | null;
  } | null;
};

/** Everything one property card needs. Plain object — no hooks inside. */
export type K1Slice = {
  ready: boolean;
  data: K1Payload | null;
  year: number;
  years: number[];
  busy: boolean;
  /** Owner id whose upload is in flight. */
  uploading: string | null;
  error: string | null;
  docFor: (ownerId: string) => K1Document | undefined;
  ownerFor: (ownerId: string) => K1Owner | undefined;
  /** Every K-1 uploaded for the year is published. */
  published: boolean;
  uploadedCount: number;
  ownerCount: number;
  missingCount: number;
  linkCount: number;
  openedCount: number;
  /** Owners with a K-1 uploaded for the year. Sending publishes it, so having
   *  the document is the only precondition for a link. */
  shareableIds: string[];
  selected: Set<string>;
  toggleSelected: (ownerId: string) => void;
  setSelected: (ids: string[]) => void;
  setYear: (y: number) => void;
  upload: (ownerId: string, file: File) => void;
  remove: (doc: K1Document) => void;
  setPublished: (publish: boolean) => void;
  /** Mint links for these owners; `send` also emails each of them. */
  share: (ownerIds: string[], send: boolean) => void;
  /** Set (or clear, with "") where one owner's link is emailed. */
  setEmail: (ownerId: string, email: string) => void;
  /** Kill a link. The way to undo a test send, or a link sent to the wrong
   *  address — it also reverts that investor's tax-tracker tick. */
  revoke: (linkId: string) => void;
  /** Selected owners with no address — a send would create their link but
   *  couldn't deliver it, so the page warns before rather than after. */
  selectedWithoutEmail: string[];
};

const thisYear = new Date().getFullYear();
const emptySet: Set<string> = new Set();

export function useK1Registry(enabled: boolean, openK1Codes: string[]) {
  const [years, setYears] = useState<Record<string, number>>({});
  const [data, setData] = useState<Record<string, K1Payload>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [selection, setSelection] = useState<Record<string, Set<string>>>({});
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ code: string; ownerId: string } | null>(null);
  const [batch, setBatch] = useState<ShareBatch | null>(null);
  const [interests, setInterests] = useState<Record<string, K1Interest[]>>({});
  // Keyed `<code>@<year>` so changing the year refetches, but re-renders don't.
  const loaded = useRef<Set<string>>(new Set());

  const yearOf = useCallback((code: string) => years[code] ?? thisYear - 1, [years]);

  const load = useCallback(async (code: string, year: number) => {
    try {
      const j = await fetch(`/api/investor-k1?property=${code}&year=${year}`, { cache: "no-store" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error ?? "Could not load.");
      setData((d) => ({ ...d, [code]: j }));
      setErrors((e) => ({ ...e, [code]: null }));
    } catch (e) {
      setErrors((x) => ({ ...x, [code]: e instanceof Error ? e.message : "Could not load." }));
    }
  }, []);

  // Fetch when a K-1 card opens, and again whenever its year changes.
  const openKey = openK1Codes.join(",");
  const yearKey = openK1Codes.map((c) => `${c}@${yearOf(c)}`).join(",");
  useEffect(() => {
    if (!enabled) return;
    for (const code of openK1Codes) {
      const key = `${code}@${yearOf(code)}`;
      if (loaded.current.has(key)) continue;
      loaded.current.add(key);
      void load(code, yearOf(code));
    }
    // Depend on the derived keys, not the array identity, so this doesn't fire
    // on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, openKey, yearKey]);

  // By Investor: the same records, grouped by the person rather than the
  // partnership. One person can hold several interests in one partnership and
  // they receive SEPARATE K-1s, so these are never merged.
  const loadInvestor = useCallback(async (name: string) => {
    try {
      const j = await fetch(`/api/investor-k1?investor=${encodeURIComponent(name)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null));
      setInterests((s) => ({ ...s, [name]: j?.ok ? (j.interests ?? []) : [] }));
    } catch { setInterests((s) => ({ ...s, [name]: [] })); }
  }, []);

  const refresh = useCallback(async (code: string) => {
    await load(code, yearOf(code));
  }, [load, yearOf]);

  const act = useCallback(async (code: string, fn: () => Promise<void>) => {
    setBusyCode(code);
    setErrors((e) => ({ ...e, [code]: null }));
    try {
      await fn();
      await refresh(code);
    } catch (e) {
      setErrors((x) => ({ ...x, [code]: e instanceof Error ? e.message : "Something went wrong." }));
    } finally { setBusyCode(null); }
  }, [refresh]);

  const slice = useCallback((code: string): K1Slice => {
    const payload = data[code] ?? null;
    const docs = payload?.documents ?? [];
    const owners = payload?.owners ?? [];
    const year = yearOf(code);
    const docFor = (ownerId: string) => docs.find((d) => d.ownerId === ownerId);

    return {
      ready: !!payload,
      data: payload,
      year,
      years: Array.from(new Set([...(payload?.years ?? []), thisYear - 1, thisYear - 2])).sort((a, b) => b - a),
      busy: busyCode === code,
      uploading: uploading?.code === code ? uploading.ownerId : null,
      error: errors[code] ?? null,
      docFor,
      ownerFor: (ownerId: string) => owners.find((o) => o.id === ownerId),
      published: docs.length > 0 && docs.every((d) => d.published),
      uploadedCount: docs.length,
      ownerCount: owners.length,
      missingCount: owners.filter((o) => !docs.some((d) => d.ownerId === o.id)).length,
      linkCount: owners.filter((o) => o.link).length,
      openedCount: owners.filter((o) => (o.link?.viewCount ?? 0) > 0).length,
      // One entry per PERSON — a link covers all of someone's interests, so
      // "select all" means every person who has at least one K-1 on file, keyed
      // by the first of their interests.
      shareableIds: (() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const o of owners) {
          const key = o.name.toLowerCase().replace(/\s+/g, " ").trim();
          if (seen.has(key)) continue;
          const mine = owners.filter((x) => x.name.toLowerCase().replace(/\s+/g, " ").trim() === key);
          if (!mine.some((x) => docFor(x.id))) continue;
          seen.add(key);
          out.push(mine[0].id);
        }
        return out;
      })(),
      selected: selection[code] ?? emptySet,
      selectedWithoutEmail: [...(selection[code] ?? emptySet)]
        .map((id) => owners.find((o) => o.id === id))
        .filter((o): o is K1Owner => !!o && !o.email)
        .map((o) => o.name),

      revoke: (linkId: string) => {
        void act(code, async () => {
          const res = await fetch(`/api/investor-k1/share?id=${encodeURIComponent(linkId)}`, { method: "DELETE" });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not revoke that link.");
        });
      },

      setEmail: (ownerId: string, email: string) => {
        void act(code, async () => {
          const res = await fetch("/api/investor-k1", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "email", ownerId, email }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "Could not save that address.");
        });
      },

      toggleSelected: (ownerId: string) => setSelection((s) => {
        const next = new Set(s[code] ?? []);
        if (next.has(ownerId)) next.delete(ownerId); else next.add(ownerId);
        return { ...s, [code]: next };
      }),
      setSelected: (ids: string[]) => setSelection((s) => ({ ...s, [code]: new Set(ids) })),

      setYear: (y: number) => setYears((s) => ({ ...s, [code]: y })),

      upload: (ownerId: string, file: File) => {
        setUploading({ code, ownerId });
        void act(code, async () => {
          const fd = new FormData();
          fd.append("property", code);
          fd.append("year", String(year));
          fd.append("ownerId", ownerId);
          fd.append("file", file);
          const res = await fetch("/api/investor-k1", { method: "POST", body: fd });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (HTTP ${res.status})`);
        }).finally(() => setUploading(null));
      },

      remove: (doc: K1Document) => {
        if (!confirm(`Remove ${doc.ownerName}'s ${doc.taxYear} K-1 (${doc.filename})? The file is deleted permanently.`)) return;
        void act(code, async () => {
          const res = await fetch(`/api/investor-k1?id=${doc.id}`, { method: "DELETE" });
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not delete.");
        });
      },

      setPublished: (publish: boolean) => {
        void act(code, async () => {
          const res = await fetch("/api/investor-k1", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: publish ? "publish" : "unpublish", property: code, year }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "Could not update.");
        });
      },

      share: (ownerIds: string[], send: boolean) => {
        if (ownerIds.length === 0) return;
        setBatch(null);
        void act(code, async () => {
          const res = await fetch("/api/investor-k1/share", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ propertyCode: code, ownerIds, year, send }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "Could not create the links.");
          setBatch({ key: code, sent: send, results: j.results ?? [] });
          // Sending clears the selection so a second click can't re-send to the
          // same people by accident.
          setSelection((s) => ({ ...s, [code]: new Set() }));
        });
      },
    };
  }, [data, errors, busyCode, uploading, selection, yearOf, act]);

  /** Load an investor's interests when their card opens. */
  const ensureInvestor = useCallback((name: string) => {
    if (!enabled || loaded.current.has(`inv:${name}`)) return;
    loaded.current.add(`inv:${name}`);
    void loadInvestor(name);
  }, [enabled, loadInvestor]);

  /** Interests for one investor, plus a per-interest send. */
  const investorSlice = useCallback((name: string) => {
    const rows = interests[name] ?? null;
    const byOwner = new Map((rows ?? []).map((i) => [i.ownerId, i]));
    return {
      ready: !!rows,
      interests: rows ?? [],
      forOwner: (ownerId: string) => byOwner.get(ownerId),
      // One link per investor now, so the person — not each interest — is what
      // carries it. Take whichever interest happens to hold it.
      link: (rows ?? []).map((i) => i.link).find(Boolean) ?? null,
      email: (rows ?? []).map((i) => i.email).find(Boolean) ?? null,
      /** An interest whose K-1 is uploaded, to create the link from. */
      sendableFrom: (rows ?? []).find((i) => i.documents.length > 0) ?? null,
      busy: busyCode === `inv:${name}`,
      error: errors[`inv:${name}`] ?? null,
      setEmail: (ownerId: string, email: string) => {
        const key = `inv:${name}`;
        setBusyCode(key);
        void (async () => {
          try {
            const res = await fetch("/api/investor-k1", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "email", ownerId, email }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? "Could not save that address.");
            await loadInvestor(name);
          } catch (e) {
            setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "Could not save." }));
          } finally { setBusyCode(null); }
        })();
      },

      revoke: (linkId: string) => {
        const key = `inv:${name}`;
        setBusyCode(key);
        void (async () => {
          try {
            const res = await fetch(`/api/investor-k1/share?id=${encodeURIComponent(linkId)}`, { method: "DELETE" });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not revoke.");
            await loadInvestor(name);
          } catch (e) {
            setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "Could not revoke." }));
          } finally { setBusyCode(null); }
        })();
      },

      send: (interest: K1Interest, taxYear: number) => {
        setBatch(null);
        const key = `inv:${name}`;
        setBusyCode(key);
        setErrors((e) => ({ ...e, [key]: null }));
        void (async () => {
          try {
            const res = await fetch("/api/investor-k1/share", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ propertyCode: interest.propertyCode, ownerIds: [interest.ownerId], year: taxYear, send: true }),
            });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? "Could not send.");
            setBatch({ key, sent: true, results: j.results ?? [] });
            await loadInvestor(name);
          } catch (e) {
            setErrors((x) => ({ ...x, [key]: e instanceof Error ? e.message : "Could not send." }));
          } finally { setBusyCode(null); }
        })();
      },
    };
  }, [interests, busyCode, errors, loadInvestor]);

  return { slice, batch, clearBatch: () => setBatch(null), ensureInvestor, investorSlice };
}
