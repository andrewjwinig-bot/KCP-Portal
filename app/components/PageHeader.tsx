"use client";
// THE page header (owner, 11/2026: "keep refining some pages heros … make sure
// theyre all looking good and consistent"). Every staff page used to build its
// own: a title, then a paragraph of description, then buttons on a row of
// their own, some with the KORMAN wordmark, some without. One shape now:
//
//   Title (i)                                        [Import] [Display] [Export]
//   [Property picker] [Period picker]          <- only when the page has pickers
//   Imported Nov 10 by Drew · GL ties          <- the ONE muted meta line
//
// - `info` is what the page IS / how to use it — the paragraph that used to
//   sit under the title. It lives behind the (i) beside the title.
// - `actions` sit on the RIGHT: the import first, then the menus, the page's
//   one primary action last. With `pickers` they share the pickers' row; with
//   none they sit on the title's row, so a page never has an orphan row of
//   buttons.
// - `meta` is one muted line — a `MetaLine` (LastImported.tsx) — never a paragraph.
import { InfoPopover } from "./InfoPopover";

export function PageHeader({ title, info, infoLabel, actions, pickers, meta, children, dropHandlers, dragging }: {
  title: React.ReactNode;
  /** The page's description / how-to, behind the (i) beside the title. */
  info?: React.ReactNode;
  infoLabel?: string;
  /** Right-hand controls: import first, then Display / Open / Export, primary last. */
  actions?: React.ReactNode;
  /** The page's driving pickers (HeaderSelect), property first. */
  pickers?: React.ReactNode;
  /** One muted line under the controls — pass a `MetaLine`. */
  meta?: React.ReactNode;
  /** Notices that belong to the header (an import result, an error). */
  children?: React.ReactNode;
  dropHandlers?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" };
  const group: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
  return (
    <header className="page-header" {...(dropHandlers ?? {})}
      style={dragging ? { outline: "2px dashed var(--brand)", outlineOffset: 6, borderRadius: 12 } : undefined}>
      <div style={row}>
        <div style={{ ...group, gap: 12, minWidth: 0 }}>
          <h1 style={{ margin: 0, overflowWrap: "anywhere" }}>{title}</h1>
          {info && <InfoPopover label={infoLabel ?? "About this page"} align="left"><div style={{ paddingTop: 12, fontSize: "var(--fs-14)", lineHeight: 1.5 }}>{info}</div></InfoPopover>}
        </div>
        {!pickers && actions && <div style={group}>{actions}</div>}
      </div>
      {pickers && (
        <div style={{ ...row, marginTop: 14 }}>
          <div style={group}>{pickers}</div>
          {actions && <div style={group}>{actions}</div>}
        </div>
      )}
      {meta}
      {children}
    </header>
  );
}
