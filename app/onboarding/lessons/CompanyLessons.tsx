"use client";
// Part 1 · The Company — four click-through lessons (welcome, portfolio, banks
// and loans, owners). Facts come from the handbook and, where the portal holds
// them, from the portal's own tables (PROPERTY_DEFS) so a lesson can't drift
// from the data Randy will work in. Illustrative figures are labelled as
// examples; no EINs and no account lists (the handbook carries those).

import { useMemo, useState } from "react";
import { Building2, CalendarClock, FileText, KeyRound, Landmark, Link2, Search, ShieldCheck, TriangleAlert, User, Users, Wallet } from "lucide-react";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { AMBER, Arrow, Bar, BIG_ICON, Facts, GREEN, ICON, LessonShell, Node, Note, Panel, Pick, RED, Recap, SECTION, Toggle, money, soft, type LessonProps, type Scene } from "./kit";

const def = (id: string) => PROPERTY_DEFS.find((p) => p.id === id);
const nameOf = (id: string) => def(id)?.name ?? id;
const sfOf = (id: string) => (def(id) as { sqft?: number } | undefined)?.sqft ?? 0;

function Chip({ id, lit = true, extra }: { id: string; lit?: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${lit ? "var(--brand)" : "var(--hairline)"}`, borderRadius: 8, padding: "6px 9px", background: lit ? soft(6) : "transparent", opacity: lit ? 1 : 0.45, transition: "all .3s", minWidth: 0 }}>
      <code style={{ fontWeight: 700 }}>{id}</code>
      <div style={{ fontSize: "var(--fs-12)", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(id)}</div>
      {extra && <div style={{ fontSize: "var(--fs-13)", fontWeight: 700 }}>{extra}</div>}
    </div>
  );
}
const chipGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 };

// ─────────────────────────────────────────────────────────────────────────────
// Welcome to Korman
// ─────────────────────────────────────────────────────────────────────────────

const PEOPLE: { id: string; name: string; role: string; owns: string[] }[] = [
  { id: "drew", name: "Drew Winig", role: "VP, Finance & Technology", owns: ["Monthly close and GL imports", "Statements, budgets, bank balances", "Allocated expenses, debt, investor reporting", "Your first stop for any question"] },
  { id: "alison", name: "Alison Korman", role: "President", owns: ["Reviews the budgets", "Management fees", "Commission memos"] },
  { id: "marie", name: "Marie Jaster", role: "Controller", owns: ["Payroll and commission GL imports", "AP summary emails", "Deposits, bank fees, legal bills"] },
  { id: "harry", name: "Harry Feldman", role: "VP, Asset Management & Development", owns: ["Credit card statement", "Biweekly payroll report", "Shopping center leasing and commissions", "Retail move-outs"] },
  { id: "nancy", name: "Nancy Fox", role: "Office leasing", owns: ["Business park leasing and commissions", "Office move-outs", "The Office Works deposits"] },
  { id: "tanya", name: "Tanya Rovkin", role: "Accounts receivable", owns: ["Posts tenant charges in Skyline", "Management fees", "U&O tax"] },
  { id: "greg", name: "Greg Masciantonio", role: "Maintenance", owns: ["Building maintenance budgets", "Maintenance requests"] },
  { id: "tami", name: "Tami Tomlinson", role: "Deposits", owns: ["Lockbox and ACH rent deposits", "The tenant credit schedule"] },
];
export function Welcome({ onFinish, done }: LessonProps) {
  const [face, setFace] = useState<"world" | "books">("world");
  const [person, setPerson] = useState("drew");
  const p = PEOPLE.find((x) => x.id === person)!;

  const scenes: Scene[] = [
    {
      kicker: "Welcome", title: "Two names, one company",
      body: <>Korman Commercial Properties is a family-owned commercial real estate company — five generations in the Philadelphia market. We own and manage business parks and shopping centers, plus a few homes and some land. <strong>In the books, the company is LIK Management, Inc. (<code>2010</code>).</strong> Same people, two names.</>,
      doThis: "Toggle between the two views.",
      stage: (
        <div style={{ display: "grid", gap: 16 }}>
          <Toggle value={face} onChange={setFace} options={[{ id: "world", label: "How the world sees us" }, { id: "books", label: "How the books see us" }]} />
          {face === "world" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <Node big lit icon={<Building2 {...BIG_ICON} />} title="Korman Commercial Properties" sub="The name on the website, the leases' letterhead and your email signature" />
              <Note>Tenants, brokers and lenders know us by this name.</Note>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <Node big lit icon={<Users {...BIG_ICON} />} title={<><code>2010</code> · LIK Management, Inc.</>} sub="The entity that employs the team and earns the management fee" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
                <Node lit icon={<Wallet {...ICON} />} title={<><code>2000</code> · LIK Clearing</>} sub="Pays payroll and shared costs" />
                <Arrow />
                <Node lit icon={<Building2 {...ICON} />} title="Every property" sub="Billed its share, pays it back" />
              </div>
              <Note>That loop — paid once, billed back — shows up everywhere. It gets its own lesson later.</Note>
            </div>
          )}
        </div>
      ),
    },
    {
      kicker: "The team", title: "Who does what",
      body: <>It's a small team, so each process has one owner. Knowing who owns what tells you who to ask — and whose numbers you're checking. <strong>Greg reports to both Harry and Drew; Tami to both Nancy and Marie.</strong></>,
      doThis: "Select a name for their area of ownership.",
      stage: (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            {PEOPLE.map((x) => (
              <Pick key={x.id} on={x.id === person} onClick={() => setPerson(x.id)}>
                <span style={{ fontWeight: 700 }}>{x.name}</span><span style={{ color: "var(--muted)", fontSize: "var(--fs-13)", textAlign: "right" }}>{x.role}</span>
              </Pick>
            ))}
          </div>
          <Panel title="Owns">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ width: 44, height: 44, borderRadius: 999, background: soft(10), color: "var(--brand)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><User {...BIG_ICON} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 18 }}>{p.name}</div><div style={{ color: "var(--muted)" }}>{p.role}</div></div>
            </div>
            <div style={{ display: "grid", gap: 0 }}>
              {p.owns.map((o) => <div key={o} className="task-row" style={{ padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>{o}</div>)}
            </div>
          </Panel>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>The company and team in brief.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Korman Commercial is LIK Management", "One company: the name we go by, and 2010 in the books. 2000 pays shared costs and bills them back."],
        ["Every process has an owner", "Credit cards and payroll are Harry's, office leasing Nancy's, tenant charges Tanya's, deposits Tami's."],
        ["Drew is the first point of contact", "For process, systems and where anything lives in the portal."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Portfolio
// ─────────────────────────────────────────────────────────────────────────────

type Book = "bp" | "sc" | "kh" | "ow" | "land" | "lik";
const BOOKS: { id: Book; label: string; blurb: string; ids: string[] }[] = [
  { id: "bp", label: "Business parks", blurb: "The Neshaminy Interplex — ten office buildings in two funds, JV III and NI LLC.", ids: PROPERTY_DEFS.filter((p) => p.allocGroup === "BP").map((p) => p.id) },
  { id: "sc", label: "Shopping centers", blurb: "Gray's Ferry, Parkwood, Brookwood, Lafayette Hill and more — nearly every tenant NNN.", ids: PROPERTY_DEFS.filter((p) => p.type === "Retail").map((p) => p.id) },
  { id: "kh", label: "Korman Homes", blurb: "Residential rentals in Fort Washington, Ambler and Lafayette Hill — gross leases.", ids: PROPERTY_DEFS.filter((p) => p.type === "Residential").map((p) => p.id) },
  { id: "ow", label: "The Office Works", blurb: "Executive office suites inside Building 5, rented by the office.", ids: ["4900"] },
  { id: "land", label: "Land", blurb: "Land holdings. Little activity, so their GLs are imported quarterly.", ids: PROPERTY_DEFS.filter((p) => p.type === "Land").map((p) => p.id) },
  { id: "lik", label: "LIK and holding", blurb: "LIK Management (the company) and The Korman Co.", ids: ["2010", "TKCO"] },
];

type Fund = "jv3" | "nillc";
const FUNDS: Record<Fund, { name: string; statement: string; fund: string; holding: string; buildings: string[]; condo?: string }> = {
  jv3: { name: "JV III", statement: "PJV3", fund: "FJVIII", holding: "3600", buildings: ["3610", "3620", "3640"], condo: "3610A" },
  nillc: { name: "NI LLC", statement: "PNIPLX", fund: "FNIPLX", holding: "4000", buildings: ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"] },
};

type County = "bucks" | "phila" | "mont" | "nj";
const COUNTIES: Record<County, { label: string; ids: string[]; tax: string }> = {
  bucks: { label: "Bucks", ids: [...PROPERTY_DEFS.filter((p) => p.allocGroup === "BP").map((p) => p.id), "2300", "2070"], tax: "County and township bills in April, school in August–September. Paid early for the 2% discount." },
  phila: { label: "Philadelphia", ids: ["1100", "7010", "4500", "7200", "7300", "8200", "5600", "1500", "9200"], tax: "One bill, due March 31 — paid by the end of February for the 1% discount. Plus U&O tax monthly, and BIRT / NPT." },
  mont: { label: "Montgomery", ids: ["9510", "9000", "9800", "9820", "9840", "9860"], tax: "County and municipal in spring, school in September. Paid early for the 2% discount." },
  nj: { label: "New Jersey", ids: ["0800"], tax: "Bellmawr land — its own municipal bill, plus a quarterly Net Profits Tax." },
};

const IP_BUILDINGS: { key: string; code: string; label: string }[] = [
  { key: "1", code: "3610", label: "Building 1" }, { key: "2", code: "3620", label: "Building 2" }, { key: "4", code: "3640", label: "Building 4" },
  { key: "5", code: "4050", label: "Building 5" }, { key: "6", code: "4060", label: "Building 6" }, { key: "7", code: "4070", label: "Building 7" },
  { key: "8", code: "4080", label: "Building 8" }, { key: "A", code: "40A0", label: "Kor Center A" }, { key: "B", code: "40B0", label: "Kor Center B" }, { key: "C", code: "40C0", label: "Kor Center C" },
];
type CenterId = "grays-ferry" | "parkwood" | "brookwood" | "lafayette-hill" | "parkwood-commons";
const CENTERS: Record<CenterId, { code: string; name: string; photo: string; plan: string; note: string }> = {
  "grays-ferry": { code: "4500", name: "Gray's Ferry", photo: "/centers/grays-ferry/assets/hero.jpg", plan: "/centers/grays-ferry/assets/siteplan.webp", note: "The largest center — anchored by the Fresh Grocer, in South Philadelphia." },
  parkwood: { code: "7010", name: "Parkwood", photo: "/centers/parkwood/assets/hero.jpg", plan: "/centers/parkwood/assets/siteplan.webp", note: "Retail with an office center upstairs — which is why it has two CAM pools." },
  brookwood: { code: "2300", name: "Brookwood", photo: "/centers/brookwood/assets/hero.jpg", plan: "/centers/brookwood/assets/siteplan.webp", note: "On Street Road in Bensalem, Bucks County." },
  "lafayette-hill": { code: "9510", name: "Lafayette Hill", photo: "/centers/lafayette-hill/assets/hero.jpg", plan: "/centers/lafayette-hill/assets/siteplan-tight.webp", note: "The Shops of Lafayette Hill, Montgomery County. Wawa here is billed quarterly." },
  "parkwood-commons": { code: "1100", name: "Parkwood Commons", photo: "/centers/parkwood-commons/assets/g-corner.jpg", plan: "/centers/parkwood-commons/assets/siteplan.webp", note: "The small professional building on Academy Road, next to Parkwood." },
};
const IMG: React.CSSProperties = { width: "100%", borderRadius: 10, border: "1px solid var(--border)", display: "block", objectFit: "cover", background: "var(--hairline)" };

export function Portfolio({ onFinish, done }: LessonProps) {
  const [book, setBook] = useState<Book>("bp");
  const [q, setQ] = useState("");
  const [fund, setFund] = useState<Fund>("jv3");
  const [county, setCounty] = useState<County>("bucks");
  const [bldg, setBldg] = useState("8");
  const [center, setCenter] = useState<CenterId>("grays-ferry");
  const [centerView, setCenterView] = useState<"photo" | "plan">("photo");
  const b = BOOKS.find((x) => x.id === book)!;
  const bookSf = b.ids.reduce((s, id) => s + sfOf(id), 0);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return PROPERTY_DEFS.filter((p) => p.id.toLowerCase().startsWith(t) || p.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q]);
  const f = FUNDS[fund];

  const scenes: Scene[] = [
    {
      kicker: "The portfolio", title: "Everything is grouped into books",
      body: <>The properties fall into <strong>books</strong> — business parks, shopping centers, Korman Homes, The Office Works, land and LIK itself. Budgets, reports and allocations are organized by book, so it's the first thing to know about any property.</>,
      doThis: "Open each book",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={book} onChange={setBook} options={BOOKS.map((x) => ({ id: x.id, label: x.label }))} />
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline" }}>
            <span><strong style={{ fontSize: 28 }}>{b.ids.length}</strong> <span style={{ color: "var(--muted)" }}>codes</span></span>
            {bookSf > 0 && <span><strong style={{ fontSize: 28 }}>{bookSf.toLocaleString()}</strong> <span style={{ color: "var(--muted)" }}>square feet</span></span>}
          </div>
          <Note>{b.blurb}</Note>
          <div style={chipGrid}>{b.ids.map((id) => <Chip key={id} id={id} extra={sfOf(id) ? `${sfOf(id).toLocaleString()} SF` : undefined} />)}</div>
        </div>
      ),
    },
    {
      kicker: "Codes", title: "Everyone talks in codes",
      body: <>Every property has a four-character code used in Skyline, the GL and the portal — and people use the code and the name interchangeably. <strong>“4500” is Gray's Ferry.</strong> You'll hear “post it to 4060” long before you hear “Building 6.” Learn the big ones early.</>,
      doThis: "Look one up — try 4500, 9510 or “Parkwood”",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "0 12px", height: 44 }}>
            <Search size={18} strokeWidth={1.75} style={{ color: "var(--muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="A code or a name" aria-label="Look up a property"
              style={{ border: 0, outline: 0, flex: 1, background: "transparent", boxShadow: "none", padding: 0, height: 40 }} />
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["4500", "9510", "4080", "2300", "7010", "2010"].map((c) => <button key={c} type="button" className="btn sm" onClick={() => setQ(c)}><code>{c}</code></button>)}
          </div>
          {hits.length > 0 ? (
            <div style={{ display: "grid", gap: 0 }}>
              {hits.map((p) => (
                <div key={p.id} className="task-row" style={{ display: "grid", gridTemplateColumns: "70px minmax(0,1fr) auto", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--hairline)", alignItems: "center" }}>
                  <code style={{ fontWeight: 700, fontSize: 16 }}>{p.id}</code>
                  <div><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ color: "var(--muted)", fontSize: "var(--fs-13)" }}>{[p.type, (p as { fundGroup?: string }).fundGroup, (p as { city?: string }).city].filter(Boolean).join(" · ")}</div></div>
                  <span style={{ color: "var(--muted)" }}>{sfOf(p.id) ? `${sfOf(p.id).toLocaleString()} SF` : ""}</span>
                </div>
              ))}
            </div>
          ) : <Note>{q ? "No match — try part of a name." : "Type to search the portfolio."}</Note>}
        </div>
      ),
    },
    {
      kicker: "See it", title: "The Neshaminy Interplex",
      body: <>The business parks are one campus in Trevose — the <strong>Neshaminy Interplex</strong>: Buildings 1–8 and the three Kor Centers along Interplex Drive. (Building 3 is in the middle of it, but isn't ours.) Every office building's floor plans are on its property page, colored by the rent roll.</>,
      doThis: "Click a building",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <img src="/site/interplex/assets/campus-map.png" alt="Neshaminy Interplex campus map" style={{ ...IMG, objectFit: "contain", background: "var(--card)" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {IP_BUILDINGS.map((x) => <button key={x.key} type="button" className={bldg === x.key ? "btn sm primary lesson-toggle" : "btn sm lesson-toggle"} onClick={() => setBldg(x.key)}>{x.label}</button>)}
          </div>
          {(() => { const x = IP_BUILDINGS.find((y) => y.key === bldg)!; return (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 12, alignItems: "start" }}>
              <img key={x.key} src={`/site/interplex/assets/b-${x.key}.jpg`} alt={x.label} style={{ ...IMG, aspectRatio: "4 / 3" }} />
              <Panel title={<><code>{x.code}</code> {x.label}</>}>
                <Facts rows={[["Fund", (def(x.code) as { fundGroup?: string } | undefined)?.fundGroup ?? "—"], ["Size", `${sfOf(x.code).toLocaleString()} SF`], ["Built", String((def(x.code) as { yearBuilt?: number } | undefined)?.yearBuilt ?? "—")]]} />
              </Panel>
            </div>
          ); })()}
        </div>
      ),
    },
    {
      kicker: "See it", title: "The shopping centers",
      body: <>Five of the centers have their own designed pages with an <strong>interactive site plan</strong> — and the same plan, colored by lease expiry, rent or A/R, sits on each property page in the portal. Worth a look at each before your first statement review.</>,
      doThis: "Pick a center, then flip to its site plan",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <Toggle value={center} onChange={setCenter} options={(Object.keys(CENTERS) as CenterId[]).map((k) => ({ id: k, label: CENTERS[k].name }))} />
          <Toggle value={centerView} onChange={setCenterView} options={[{ id: "photo", label: "Photo" }, { id: "plan", label: "Site plan" }]} />
          <img key={center + centerView} src={centerView === "photo" ? CENTERS[center].photo : CENTERS[center].plan} alt={`${CENTERS[center].name} ${centerView === "photo" ? "photo" : "site plan"}`}
            style={{ ...IMG, aspectRatio: centerView === "photo" ? "16 / 9" : undefined, objectFit: centerView === "photo" ? "cover" : "contain", background: "var(--card)" }} />
          <Note><code>{CENTERS[center].code}</code> · {CENTERS[center].note}</Note>
        </div>
      ),
    },
    {
      kicker: "The funds", title: "The business parks sit in two funds",
      body: <>The Interplex buildings belong to two funds, <strong>JV III</strong> and <strong>NI LLC</strong>. Each fund <strong>banks through one account</strong> and holds its <strong>mortgage at a holding entity</strong>. A fund statement (<code>PJV3</code> / <code>PNIPLX</code>) is its buildings consolidated.</>,
      doThis: "Switch funds and follow the structure",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <Toggle value={fund} onChange={setFund} options={[{ id: "jv3", label: "JV III" }, { id: "nillc", label: "NI LLC" }]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Node lit icon={<FileText {...ICON} />} title={<>Fund statement <code>{f.statement}</code></>} sub={<>Fund code <code>{f.fund}</code> · its buildings consolidated</>} />
            <Node lit icon={<Landmark {...ICON} />} title={<>Holding entity <code>{f.holding}</code></>} sub="Holds the fund's mortgage" />
          </div>
          <Arrow down />
          <div style={chipGrid}>{f.buildings.map((id) => <Chip key={id} id={id} extra={`${sfOf(id).toLocaleString()} SF`} />)}</div>
          {f.condo ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Node lit icon={<Building2 {...ICON} />} title={<>Condo <code>{f.condo}</code></>} sub="CAM for the JV III buildings runs through it" />
              <Node tone={AMBER} lit icon={<Building2 {...ICON} />} title={<>Building 3 <code>3630</code></>} sub="In the condo, but Jefferson's — pays condo fees, we don't own or manage it" />
            </div>
          ) : <Note>NI LLC's seven buildings include the three Kor Centers (<code>40A0</code>, <code>40B0</code>, <code>40C0</code>).</Note>}
        </div>
      ),
    },
    {
      kicker: "Location", title: "Where it sits decides when taxes are due",
      body: <>Each county bills real estate taxes on its own calendar, and Philadelphia adds its own business taxes. Knowing a property's county tells you when its tax bills land and which discount window to hit.</>,
      doThis: "Pick a county",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={county} onChange={setCounty} options={(Object.keys(COUNTIES) as County[]).map((k) => ({ id: k, label: COUNTIES[k].label }))} />
          <Panel title={<><CalendarClock size={14} strokeWidth={1.75} style={{ verticalAlign: "-2px" }} /> Tax timing</>}><div style={{ lineHeight: 1.55 }}>{COUNTIES[county].tax}</div></Panel>
          <div style={chipGrid}>{COUNTIES[county].ids.filter((id) => def(id)).map((id) => <Chip key={id} id={id} />)}</div>
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>The portfolio in three lines. Not budgeted by design: <code>0800</code>, <code>0300</code>, WHIT and CWD — don't flag them as gaps.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Books first, then codes", "Every property belongs to a book, and everyone refers to it by its four-character code."],
        ["The funds roll up", "JV III and NI LLC each bank through one account, hold the mortgage at 3600 / 4000, and report as PJV3 / PNIPLX."],
        ["The county sets the tax calendar", "Bucks, Philadelphia, Montgomery and New Jersey each bill on their own schedule."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Banks, Loans and Deposits
// ─────────────────────────────────────────────────────────────────────────────

type BankId = "chase" | "liberty" | "mt";
const BANKS: Record<BankId, { name: string; holds: string[] }> = {
  chase: { name: "Chase", holds: ["Most property operating accounts", "LIK Management and LIK Clearing (2000)", "The fund accounts — JV III and NI LLC each bank through one"] },
  liberty: { name: "Liberty Bank", holds: ["Most of the mortgages", "The security deposit accounts", "The money markets"] },
  mt: { name: "M&T", holds: ["The Office Works", "The Nockamixon land", "An LIK account", "The Butler & Main and two Korman Homes loans"] },
};
const LOANS: { code: string; name: string; lender: string; original: number; rate: string; matures: [number, number]; note?: string }[] = [
  { code: "2300", name: "Brookwood", lender: "Liberty", original: 5_000_000, rate: "3.50%", matures: [2027, 9] },
  { code: "7010", name: "Parkwood", lender: "Liberty", original: 4_750_000, rate: "3.50%", matures: [2027, 9] },
  { code: "3600", name: "JV III", lender: "Liberty", original: 7_100_000, rate: "4.50%", matures: [2028, 3] },
  { code: "4000", name: "NI LLC", lender: "Liberty", original: 26_500_000, rate: "4.90%", matures: [2028, 3] },
  { code: "4500", name: "Gray's Ferry", lender: "Liberty", original: 9_000_000, rate: "3.55%", matures: [2028, 10] },
  { code: "9000", name: "Butler & Main", lender: "ICA / M&T", original: 1_400_000, rate: "6.55%", matures: [2036, 10] },
  { code: "9800", name: "Bellaire", lender: "M&T", original: 476_250, rate: "5.625%", matures: [2056, 9], note: "Interest only" },
  { code: "9840", name: "Joshua Rd", lender: "M&T", original: 375_000, rate: "5.625%", matures: [2056, 9], note: "Interest only" },
];
const WATCH: [number, number] = [2028, 3];
const watched = (m: [number, number]) => m[0] < WATCH[0] || (m[0] === WATCH[0] && m[1] <= WATCH[1]);

export function CashDebt({ onFinish, done }: LessonProps) {
  const [bank, setBank] = useState<BankId>("chase");
  const [countSd, setCountSd] = useState(false);
  const [loan, setLoan] = useState("2300");
  const [posting, setPosting] = useState<"right" | "wrong">("right");
  const L = LOANS.find((x) => x.code === loan)!;

  // Example balances, clearly not real.
  const ops = 1_850_000, sd = 640_000;
  const available = ops + (countSd ? sd : 0);
  // Example mortgage payment.
  const pay = 30_000, interest = 18_000, principal = pay - interest, opening = 4_200_000;
  const glBalance = opening - (posting === "right" ? principal : 0);
  const lenderBalance = opening - principal;

  const scenes: Scene[] = [
    {
      kicker: "Banks", title: "Three banks, each with a job",
      body: <>Accounts are always referred to by their <strong>last four</strong> — “x5631.” Which bank an account is at tells you a lot about what it's for.</>,
      doThis: "Click each bank",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10 }}>
            {(Object.keys(BANKS) as BankId[]).map((k) => (
              <Node key={k} big lit={bank === k} onClick={() => setBank(k)} icon={<Landmark {...BIG_ICON} />} title={BANKS[k].name} />
            ))}
          </div>
          <Panel title={`At ${BANKS[bank].name}`}>
            <div>{BANKS[bank].holds.map((h) => <div key={h} className="task-row" style={{ padding: "9px 2px", borderBottom: "1px solid var(--hairline)" }}>{h}</div>)}</div>
          </Panel>
          <Note>The full account list, by bank, is in the handbook (2.4).</Note>
        </div>
      ),
    },
    {
      kicker: "Deposits", title: "Security deposits are never our cash",
      body: <>A tenant's security deposit is <strong>their money</strong>, held in its own Liberty accounts — <code>x7448</code> for NI LLC, <code>x7216</code> for everyone else, plus the <code>x8276</code> money market. It's never counted as available cash, and you'll reconcile those accounts on an ongoing basis.</>,
      doThis: "Toggle the deposits to see the effect on available cash.",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ ...SECTION }}>Example balances</div>
          <Bar label="Operating accounts" value={ops} max={ops + sd} note={money(ops)} />
          <Bar label="Security deposits" value={sd} max={ops + sd} tone={countSd ? RED : "var(--c-98a2b3)"} note={money(sd)} />
          <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={countSd} onChange={(e) => setCountSd(e.target.checked)} /> Count security deposits as available cash
          </label>
          <div style={{ borderTop: "2px solid var(--text)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontWeight: 700 }}>Available cash</span><strong style={{ fontSize: 24, color: countSd ? RED : "var(--text)" }}>{money(available)}</strong>
          </div>
          {countSd
            ? <Note tone={RED}><TriangleAlert size={16} strokeWidth={1.75} style={{ verticalAlign: "-3px" }} /> Overstated by {money(sd)} — that's money owed back to tenants when they leave.</Note>
            : <Note tone={GREEN}><ShieldCheck size={16} strokeWidth={1.75} style={{ verticalAlign: "-3px" }} /> Bank Balances keeps deposits in their own group, outside Net available.</Note>}
        </div>
      ),
    },
    {
      kicker: "Debt", title: "Eight mortgages, and a watch list",
      body: <>Only eight properties carry debt. The <strong>watch list</strong> is anything maturing by 3/2028 — Brookwood and Parkwood in 9/2027, then the two fund loans in 3/2028. Those are the refinancings coming up.</>,
      doThis: "Click a loan",
      stage: (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            {LOANS.map((x) => (
              <Pick key={x.code} on={x.code === loan} onClick={() => setLoan(x.code)} tone={watched(x.matures) ? AMBER : undefined}>
                <span><code>{x.code}</code> {x.name}</span>
                <span style={{ fontWeight: 700, color: watched(x.matures) ? AMBER : "var(--muted)" }}>{x.matures[1]}/{x.matures[0]}</span>
              </Pick>
            ))}
          </div>
          <Panel title={<><code>{L.code}</code> {L.name}</>} right={watched(L.matures) ? <span style={{ color: AMBER, fontWeight: 700 }}>Watch list</span> : undefined}>
            <Facts rows={[
              ["Lender", L.lender],
              ["Original", money(L.original)],
              ["Rate", L.rate],
              ["Matures", `${L.matures[1]}/${L.matures[0]}`],
              ...(L.note ? [["Terms", L.note] as [string, string]] : []),
              ...(L.code === "3600" || L.code === "4000" ? [["Booked at", "The fund's holding entity"] as [string, string]] : []),
            ]} />
          </Panel>
        </div>
      ),
    },
    {
      kicker: "Your check", title: "Does the mortgage post correctly?",
      body: <>Each payment is part <strong>interest</strong> (an expense, <code>9210</code>) and part <strong>principal</strong> (it reduces the loan, <code>27xx</code>). The Debt Tracker gives the split. Your monthly check: the loan balance in the GL matches the lender's statement.</>,
      doThis: "Compare the two postings.",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example payment · {money(pay)}</div>
          <Toggle value={posting} onChange={setPosting} options={[{ id: "right", label: "Split interest and principal" }, { id: "wrong", label: "Post it all to interest" }]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Node lit icon={<FileText {...ICON} />} title={<>Interest <code>9210</code></>} sub={money(posting === "right" ? interest : pay)} />
            <Node lit={posting === "right"} icon={<Landmark {...ICON} />} title={<>Principal <code>27xx</code></>} sub={money(posting === "right" ? principal : 0)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Panel title="GL loan balance"><strong style={{ fontSize: 22, color: glBalance === lenderBalance ? "var(--text)" : RED }}>{money(glBalance)}</strong></Panel>
            <Panel title="Lender statement"><strong style={{ fontSize: 22 }}>{money(lenderBalance)}</strong></Panel>
          </div>
          {glBalance === lenderBalance
            ? <Note tone={GREEN}>Ties. The loan went down by the principal, and interest expense is right.</Note>
            : <Note tone={RED}>Off by {money(glBalance - lenderBalance)} — the loan never went down, and expenses are overstated by the same amount.</Note>}
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>Cash and debt in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Three banks, last four", "Chase for operations, Liberty for most loans and the deposits, M&T for The Office Works and a few others."],
        ["Deposits are tenants' money", "Reconciled and kept separate, never counted as available cash."],
        ["Mortgages tie to the lender", "Interest to 9210, principal to 27xx; watch the loans maturing by 3/2028."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Owners, K-1s and Distributions
// ─────────────────────────────────────────────────────────────────────────────

export function Owners({ onFinish, done }: LessonProps) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(5);
  const [form, setForm] = useState<"k1" | "e">("k1");
  const [dist, setDist] = useState(300_000);
  const [pct, setPct] = useState(10);
  const [paTax, setPaTax] = useState(1_200);
  const [view, setView] = useState<"market" | "books">("market");

  const effective = (inner / 100) * 80;
  const gross = Math.round((dist * pct) / 100);

  const scenes: Scene[] = [
    {
      kicker: "Ownership", title: "Ownership can run two tiers deep",
      body: <>Most properties are partnerships owned by family members and trusts. Some partners are <strong>themselves entities</strong> with partners of their own, so an investor's real share is their share of the entity times the entity's share of the property. The Interstate land (<code>0800</code>) is the example: Hyman Korman Co. holds 80%, fourteen trusts hold the other 20%.</>,
      doThis: "Open Hyman Korman Co. and slide a partner's share",
      stage: (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={SECTION}><code>0800</code> partners</div>
          <Node lit={open} onClick={() => setOpen((v) => !v)} icon={<Users {...ICON} />} title="Hyman Korman Co. · 80%" sub={open ? "24 partners of its own — click to close" : "An entity with 24 partners of its own — click to open"} />
          {open && (
            <div style={{ marginLeft: 22, borderLeft: "1px solid var(--border)", paddingLeft: 14, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>A partner holding <strong>{inner}%</strong> of Hyman Korman Co.</span>
                <input type="range" min={1} max={30} value={inner} onChange={(e) => setInner(+e.target.value)} style={{ accentColor: "var(--brand)" }} />
              </label>
              <Note tone="var(--brand)">{inner}% of 80% = <strong>{effective.toFixed(1)}%</strong> of the property</Note>
            </div>
          )}
          <Node icon={<User {...ICON} />} title="Fourteen trusts · 20% together" sub="Partners of the property directly" />
          <Note>The roster and percentages live in Investor Info — the source for K-1s and distribution splits.</Note>
        </div>
      ),
    },
    {
      kicker: "Tax forms", title: "K-1 or Schedule E",
      body: <>A partnership gives each partner a <strong>K-1</strong> — their share of its income — prepared by EisnerAmper's tax team. One property is different: <code>0900</code> Lincoln BLS is <strong>held directly</strong>, so its owners get a Schedule E instead.</>,
      doThis: "Switch between the two",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={form} onChange={setForm} options={[{ id: "k1", label: "A partnership" }, { id: "e", label: "Held directly (0900)" }]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center" }}>
            <Node big lit icon={<Building2 {...BIG_ICON} />} title={form === "k1" ? "The partnership" : <><code>0900</code> Lincoln BLS</>} sub={form === "k1" ? "Files its own return" : "No partnership return"} />
            <Arrow />
            <Node big lit icon={<FileText {...BIG_ICON} />} title={form === "k1" ? "Schedule K-1" : "Schedule E"} sub={form === "k1" ? "One per partner, per partnership" : "One page per owner"} />
          </div>
          <Note>Either way it goes out the same way — the next step.</Note>
        </div>
      ),
    },
    {
      kicker: "Delivery", title: "A link and a separate PIN",
      body: <>A K-1 carries taxpayer IDs and capital accounts, so it's <strong>never attached to an email</strong>. It's uploaded onto the partner's row in the portal and sent as a secure link — then a <strong>second email</strong> carries the PIN. Neither email alone opens it.</>,
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", gap: 8, alignItems: "center" }}>
            <Node lit icon={<FileText {...ICON} />} title="Uploaded" sub="Onto the partner's row" />
            <Arrow on />
            <Node lit icon={<Link2 {...ICON} />} title="Email 1" sub="The link" />
            <Arrow on />
            <Node lit icon={<KeyRound {...ICON} />} title="Email 2" sub="The PIN" />
          </div>
          <Note>Either email on its own opens nothing — a forwarded link still asks for the PIN. The portal records when each was sent and when the partner opened it.</Note>
        </div>
      ),
    },
    {
      kicker: "Distributions", title: "Distributions, and PA withholding",
      body: <>Distributions are planned in <strong>April and October</strong> for Revere (<code>7300</code>), Parkwood (<code>7010</code>) and Trust #4 (<code>8200</code>); the amount is a judgment call on performance and cash. For Elbridge (<code>7200</code>) and Revere, the partnership pays <strong>PA tax for some partners</strong> and takes it back from their next distribution.</>,
      doThis: "Move the sliders",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={SECTION}>Example</div>
          <label style={{ display: "grid", gap: 4 }}><span>Total distribution <strong>{money(dist)}</strong></span><input type="range" min={50_000} max={600_000} step={10_000} value={dist} onChange={(e) => setDist(+e.target.value)} style={{ accentColor: "var(--brand)" }} /></label>
          <label style={{ display: "grid", gap: 4 }}><span>This partner owns <strong>{pct}%</strong></span><input type="range" min={1} max={50} value={pct} onChange={(e) => setPct(+e.target.value)} style={{ accentColor: "var(--brand)" }} /></label>
          <label style={{ display: "grid", gap: 4 }}><span>PA tax paid on their behalf <strong>{money(paTax)}</strong></span><input type="range" min={0} max={5_000} step={100} value={paTax} onChange={(e) => setPaTax(+e.target.value)} style={{ accentColor: "var(--brand)" }} /></label>
          <Panel>
            <Facts rows={[["Their share", money(gross)], ["Less PA withholding", `(${money(paTax)})`]]} />
            <div style={{ borderTop: "2px solid var(--text)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}><span>Check to the partner</span><span>{money(gross - paTax)}</span></div>
          </Panel>
          <Note>The real calculator is on each of those two property pages, with the partners' actual percentages.</Note>
        </div>
      ),
    },
    {
      kicker: "One caution", title: "The Statement of Values is not a balance sheet",
      body: <>At year end, family members can ask what their interests are worth. The <strong>Statement of Values</strong> answers that at market value. A lender asking for a balance sheet wants something else entirely — book value, from the GL. <strong>Never send one as the other.</strong></>,
      doThis: "Compare the two views of one property",
      stage: (
        <div style={{ display: "grid", gap: 14 }}>
          <Toggle value={view} onChange={setView} options={[{ id: "market", label: "Statement of Values" }, { id: "books", label: "Balance sheet" }]} />
          <div style={SECTION}>Example property</div>
          {view === "market" ? (
            <Panel title="Market value">
              <Facts rows={[["Net operating income", money(800_000)], ["Divided by a cap rate", "8.0%"], ["Value", money(10_000_000)], ["Less the mortgage", `(${money(4_000_000)})`]]} />
              <div style={{ borderTop: "2px solid var(--text)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}><span>Equity</span><span>{money(6_000_000)}</span></div>
              <Note>For family members: what is my interest worth?</Note>
            </Panel>
          ) : (
            <Panel title="Book value">
              <Facts rows={[["Building at cost", money(9_000_000)], ["Less accumulated depreciation", `(${money(4_100_000)})`], ["Cash and receivables", money(900_000)], ["Less the mortgage", `(${money(4_000_000)})`]]} />
              <div style={{ borderTop: "2px solid var(--text)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}><span>Partners' capital</span><span>{money(1_800_000)}</span></div>
              <Note>For lenders: from the GL, and it balances. The portal's Balance Sheet report builds it.</Note>
            </Panel>
          )}
        </div>
      ),
    },
    {
      kicker: "Summary", title: "Summary",
      body: <>Owners in three lines.</>,
      stage: <Recap onFinish={onFinish} done={done} items={[
        ["Look through the tiers", "A partner can be an entity with partners of its own; the roster in Investor Info is the source."],
        ["K-1s go by link and PIN", "Never attached. 0900's owners get Schedule Es instead."],
        ["Market value is not book value", "The Statement of Values is for family members; lenders get the Balance Sheet."],
      ]} />,
    },
  ];
  return <LessonShell scenes={scenes} />;
}

