// THE ORIENTATION — Randy's onboarding, built from the New Accountant Handbook
// (owner, 11/2026: "make like an onboarding orientation thing that has
// different modules for him to click through and learn to get acclimated …
// nothing too complex or too beginner"). The handbook is the reference; this
// is the guided path through it: four parts, a short lesson per module and the
// portal pages to open. No quizzes (owner) — a module is a walkthrough.
//
// Client-safe data only. Deliberately NO EINs and no full account list — the
// handbook (downloadable from the page) carries those; a lesson teaches the
// shape, not the numbers to memorise.

export type Block =
  | { t: "p"; text: string }
  | { t: "points"; items: string[] }
  | { t: "key"; text: string }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "steps"; items: { title: string; text: string }[] };

export type Module = {
  id: string;
  part: PartId;
  title: string;
  minutes: number;
  /** One line: what you'll know after it. */
  summary: string;
  /** Where it is in the handbook. */
  handbook: string;
  blocks: Block[];
  portal: { label: string; href: string }[];
  /** An interactive, step-through lesson (app/onboarding/lessons) shown in
   *  place of the text blocks — owner: "an interactive click through module
   *  where the goal is to actually get him to understand … visual and
   *  graphical and engaging". No quizzes. */
  interactive?: "money-moves";
};

export type PartId = "company" | "systems" | "role" | "work";

export const PARTS: { id: PartId; title: string; blurb: string }[] = [
  { id: "company", title: "The Company", blurb: "Who we are, what we own and who owns it" },
  { id: "systems", title: "Systems", blurb: "Skyline, the portal, AvidXchange and the chart of accounts" },
  { id: "role", title: "Your Role", blurb: "What you own and how the first 90 days run" },
  { id: "work", title: "The Recurring Work", blurb: "The monthly rhythm and how each process runs" },
];

// Text may carry `code` spans (rendered as <code>) — account numbers, property codes.
export const MODULES: Module[] = [
  // ── Part 1 · The Company ────────────────────────────────────────────────
  {
    id: "welcome",
    part: "company",
    title: "Welcome to Korman",
    minutes: 5,
    summary: "Who we are, how LIK Management fits, and who owns what",
    handbook: "Section 1",
    blocks: [
      { t: "p", text: "Korman Commercial Properties is a family-owned commercial real estate company, five generations in the Philadelphia market. We own and manage business parks and shopping centers in Philadelphia and its suburbs, plus a few Korman Homes residential properties and land holdings." },
      { t: "key", text: "Korman Commercial Properties and LIK Management, Inc. (`2010`) are the same company. Korman Commercial is the name we go by; LIK Management is the entity in the books. LIK employs the team." },
      { t: "p", text: "Payroll and shared costs are paid from `2000` (LIK Clearing) and billed back, so each property carries its share of payroll, overhead and the management fee. You'll see that loop everywhere — it gets its own module." },
      { t: "table", head: ["Person", "Role", "Owns / approves"], rows: [
        ["Drew Winig", "VP, Finance & Technology", "Monthly close, GL imports, statements, budgets, bank balances, allocated expenses, debt, investor reporting. Your first stop for questions"],
        ["Alison Korman", "President", "Reviews budgets, management fees, commission memos"],
        ["Marie Jaster", "Controller", "Receives the payroll and commission GL imports, AP summary emails; deposits, bank fees, legal bills"],
        ["Harry Feldman", "VP, Asset Management & Development", "Credit card statement, biweekly payroll report, shopping center commissions and leasing, retail move-outs"],
        ["Nancy Fox", "Office leasing", "Business park leasing and commissions, office move-outs, The Office Works deposits"],
        ["Tanya Rovkin", "Accounts receivable", "Posts tenant charges in Skyline, management fees, U&O tax"],
        ["Greg Masciantonio", "Maintenance", "Building maintenance budgets and requests"],
        ["Tami Tomlinson", "Deposits", "Lockbox and ACH rent deposits, the tenant credit schedule"],
      ] },
      { t: "p", text: "Greg reports to both Harry and Drew; Tami reports to both Nancy and Marie." },
    ],
    portal: [{ label: "Your dashboard", href: "/dashboard" }],
  },
  {
    id: "portfolio",
    part: "company",
    title: "The Portfolio",
    minutes: 8,
    summary: "Books, property codes, and how the two business park funds roll up",
    handbook: "2.1 – 2.3",
    blocks: [
      { t: "p", text: "Every property has a four-character code used in Skyline, the GL and the portal. Code and name are used interchangeably — “4500” is Gray's Ferry. Learn the codes early; everyone talks in them." },
      { t: "table", head: ["Book", "What it is", "Codes", "SF"], rows: [
        ["Business parks", "Neshaminy Interplex, held in two funds (JV III and NI LLC)", "12", "536,890"],
        ["Shopping centers", "Gray's Ferry, Parkwood, Brookwood, Lafayette Hill and more", "11", "296,787"],
        ["Korman Homes", "Residential in Fort Washington, Ambler, Lafayette Hill", "4", "5,135"],
        ["The Office Works", "Executive office suites inside Building 5", "1", "—"],
        ["Land", "Land holdings, booked quarterly", "5", "—"],
        ["LIK and holding", "LIK Management and The Korman Co", "2", "—"],
      ] },
      { t: "p", text: "The business parks are the part that takes a minute. They sit in two funds, and each fund banks through ONE account and holds its mortgage at a holding entity:" },
      { t: "table", head: ["", "JV III", "NI LLC"], rows: [
        ["Fund / portfolio statement", "`FJVIII` / `PJV3`", "`FNIPLX` / `PNIPLX`"],
        ["Holding entity (the mortgage)", "`3600`", "`4000`"],
        ["Buildings", "`3610` B1 · `3620` B2 · `3640` B4", "`4050`–`4080` B5–B8 · `40A0`/`40B0`/`40C0` Kor Centers"],
        ["Also", "Condo entity `3610A` — CAM for the JV III buildings runs through it", "—"],
      ] },
      { t: "key", text: "A fund statement (PJV3 / PNIPLX) is its buildings consolidated. Building 3 (`3630`) sits in the JV III condo but is owned by Jefferson — it pays condo fees, we don't own or manage it." },
      { t: "p", text: "Location drives the tax calendar: Bucks (the Interplex, Brookwood, Nockamixon land), Philadelphia (Parkwood, Gray's Ferry, Elbridge, Revere, Trust #4, Castor, Eastwick), Montgomery (Lafayette Hill, Butler & Main, Korman Homes) and New Jersey (Bellmawr land)." },
      { t: "p", text: "Not budgeted, by design: `0800`, `0300`, WHIT, CWD. Don't flag them as gaps." },
    ],
    portal: [{ label: "Property Info", href: "/properties" }, { label: "Rent Roll", href: "/rentroll" }],
  },
  {
    id: "cash-debt",
    part: "company",
    title: "Banks, Loans and Deposits",
    minutes: 6,
    summary: "Three banks, eight mortgages, and why security deposits are never ours",
    handbook: "2.4 – 2.5",
    blocks: [
      { t: "p", text: "Three banks. Chase holds most operating accounts. Liberty Bank holds most loans, the security deposits and the money markets. M&T holds The Office Works, the Nockamixon land and an LIK account. Accounts are always referred to by their last four (“x5631”)." },
      { t: "key", text: "Security deposits are tenants' money. They sit in their own accounts — Liberty `x7448` for NI LLC and `x7216` for every other property (plus the `x8276` money market) — and are never counted as available cash. You reconcile and maintain them on an ongoing basis." },
      { t: "table", head: ["Property", "Lender", "Original", "Rate", "Matures"], rows: [
        ["3600 JV III", "Liberty", "$7,100,000", "4.50%", "3/2028"],
        ["4000 NI LLC", "Liberty", "$26,500,000", "4.90%", "3/2028"],
        ["2300 Brookwood", "Liberty", "$5,000,000", "3.50%", "9/2027"],
        ["7010 Parkwood", "Liberty", "$4,750,000", "3.50%", "9/2027"],
        ["4500 Gray's Ferry", "Liberty", "$9,000,000", "3.55%", "10/2028"],
        ["9000 Butler & Main", "ICA / M&T", "$1,400,000", "6.55%", "10/2036"],
        ["9800 Bellaire", "M&T", "$476,250", "5.625%", "9/2056 (IO)"],
        ["9840 Joshua Rd", "M&T", "$375,000", "5.625%", "9/2056 (IO)"],
      ] },
      { t: "p", text: "The watch list is anything maturing by 3/2028: Brookwood and Parkwood in 9/2027, JV III and NI LLC in 3/2028. No other property carries debt. Monthly payments come from the Debt Tracker, and your job is to confirm the mortgages post correctly." },
      { t: "p", text: "The full account list, by bank, is in the handbook (2.4)." },
    ],
    portal: [{ label: "Bank Balances", href: "/financials/cash-analysis" }],
  },
  {
    id: "investors",
    part: "company",
    title: "Owners, K-1s and Distributions",
    minutes: 5,
    summary: "Who owns the partnerships and what goes out to them each year",
    handbook: "2.6",
    blocks: [
      { t: "p", text: "Most properties are partnerships owned by family members and trusts. Some partners are themselves entities (Hyman Korman Co., The Korman Co), so ownership can run two tiers deep. The partner roster and percentages live in the portal's Investor Info — the source for K-1s and distribution splits." },
      { t: "table", head: ["Topic", "How it works"], rows: [
        ["K-1s", "Prepared by EisnerAmper's tax team. Uploaded onto each partner's row and sent as a secure link plus a separate PIN email. Never attached to an email"],
        ["Schedule E", "`0900` Lincoln BLS is held directly, so its owners get Schedule Es, not K-1s"],
        ["Distributions", "Planned April and October for Revere (`7300`), Parkwood (`7010`) and Trust #4 (`8200`). The amount is discretionary: performance, capital needs, cash"],
        ["PA nonresident withholding", "Elbridge (`7200`) and Revere (`7300`) pay PA tax for some partners (PA-65, PA-40ES, April 15), recovered from their next distribution with the calculator on the property page"],
      ] },
      { t: "key", text: "The Statement of Values is a market-value view of each interest, prepared on request at year end. It is not a balance sheet and is never sent to a lender as one." },
    ],
    portal: [{ label: "Property Info", href: "/properties" }],
  },

  // ── Part 2 · Systems ─────────────────────────────────────────────────────
  {
    id: "systems",
    part: "systems",
    title: "Skyline, the Portal and AvidXchange",
    minutes: 7,
    summary: "The three core systems and what moves between them",
    handbook: "3.1",
    blocks: [
      { t: "p", text: "Three core systems. Skyline holds the books. The KCP Portal is where the work happens. AvidXchange pays the bills." },
      { t: "steps", items: [
        { title: "Skyline → Portal", text: "The Detailed GL each month (including the 2000 GL for allocations), the rent roll and tenant statements. It feeds statements, recs and reports" },
        { title: "Portal → AvidXchange", text: "Intercompany invoices — payroll, credit cards, allocated expenses — one PDF per building, each in its own email" },
        { title: "AvidXchange → Skyline", text: "Every approved bill, vendor and intercompany, imported into Skyline to print. Vendor invoices reach Avid at kormancommercial@avidbill.com" },
      ] },
      { t: "key", text: "All AP runs through AvidXchange, and bills are paid on Wednesdays." },
      { t: "table", head: ["Also in use", "For"], rows: [
        ["ADP", "Payroll, run by Harry. You won't use it directly"],
        ["Chase, Liberty, M&T online banking", "Statements for bank recs"],
        ["Microsoft 365 / SharePoint", "Workpapers and support, and the property and unit folders"],
        ["EisnerAmper shared portal", "Sending support, getting workpapers back"],
        ["track1099.com", "Filing 1099s in January"],
        ["PA myPATH · Philadelphia tax center · Berkheimer", "PA payments; BIRT, NPT and Philly RE tax; the 9510 / 9840 tax collector"],
      ] },
    ],
    portal: [{ label: "Report Center", href: "/reports" }],
  },
  {
    id: "portal",
    part: "systems",
    title: "Working in the Portal",
    minutes: 6,
    summary: "How the portal is laid out and the habits that save time",
    handbook: "3.2 · 6.2",
    blocks: [
      { t: "p", text: "The KCP Portal is our own platform, built on top of Skyline. It reads Skyline imports and bank exports, then builds the reports, invoices, recs and budgets — organized by property and built to surface errors and variances. You see the pages your role allows; access widens through the transition." },
      { t: "table", head: ["Section", "What's there"], rows: [
        ["Home", "Dashboard, Task Tracker (with step-by-step instructions), Filing Tracker"],
        ["Directory", "Property Info (facts, ownership, tax parcels) and Unit Info (each suite's lease and CAM setup)"],
        ["Tenancy", "Rent Roll, occupancy and leasing history"],
        ["CAM", "Reconciliations, estimates, expense history"],
        ["Invoicing", "Receivables, and the intercompany invoicers that send to Avid"],
        ["Banking", "Bank Balances, Debt Tracker, Security Deposits, Bank Recs"],
        ["Financials", "Operating Statements, Flags to Investigate, Reprojections, Budgets"],
        ["Reports", "Report Center: Balance Sheet, T-12, 1099 Register, Management Fees and more"],
      ] },
      { t: "points", items: [
        "Most pages have an Export menu (Excel or PDF). Excel totals are live formulas, so they tie when you edit.",
        "Hover a figure for its breakdown; click a statement line to see the GL transactions behind it.",
        "The search box finds a tenant, unit, property or vendor — and answers questions about the data.",
        "The AP Outbox on Drew's dashboard shows every batch sent to AvidXchange.",
      ] },
      { t: "key", text: "If something is missing or wrong, or a feature would help, tell Drew. The portal is built for how we work and changes with the team." },
    ],
    portal: [{ label: "Operating Statements", href: "/financials/operating-statements" }, { label: "Report Center", href: "/reports" }],
  },
  {
    id: "accounts",
    part: "systems",
    title: "Reading an Account Number",
    minutes: 8,
    summary: "Major-suffix accounts, the CAM suffixes, and how a statement is laid out",
    handbook: "3.3",
    blocks: [
      { t: "p", text: "An account is MAJOR-SUFFIX, like `6220-8502`. The major says what it is; the suffix says who pays. `6220-8502` reads as “building maintenance that tenants pay for through CAM.”" },
      { t: "table", head: ["You see", "It means"], rows: [
        ["`-8502`", "Reimbursable — in the CAM pool, billed back to tenants"],
        ["`-8501`", "Not reimbursable — the owner's cost"],
        ["`-8503`", "The office part of a mixed building (Parkwood 7010's upstairs office center)"],
        ["`-8599`", "Extraordinary / one-time; sits below NOI"],
        ["`-0000`", "Base account, no split (balance sheet, `1440-0000` TI)"],
        ["`-9301 / -9302 / -9303`", "Allocation suffixes in 2000: business parks / shopping centers / all properties"],
      ] },
      { t: "table", head: ["Range", "What"], rows: [
        ["`0110`–`3799`", "Balance sheet (cash 0110s, security deposits 0250s, mortgages 2500–2799, capital 3200–3799)"],
        ["`4xxx`", "Revenue: `42xx` rent, `49xx` recoveries (`4910` CAM, `4920` RE tax, `4930` insurance)"],
        ["`5xxx`–`8xxx`", "Operating expenses: `6xxx` property operations, `7xxx` marketing, `8xxx` G&A"],
        ["`14xx` / `1940`", "Capital — improvements, TI (`1440`), leasing commissions. Below NOI"],
        ["`9210` / `27xx`", "Debt service — interest, principal. Below NOI"],
      ] },
      { t: "key", text: "The rule of thumb: `-8502` coded where `-8501` belongs overbills tenants at year-end CAM; the reverse leaves money on the table. Capital work — repaving, roofs, HVAC replacement — goes in `14xx`, never a `-8502` repair line." },
      { t: "p", text: "At 2010: `4510` is management fee revenue, `8000-9900` payroll and benefits, `8110` office rent." },
    ],
    portal: [{ label: "Operating Statements", href: "/financials/operating-statements" }, { label: "Balance Sheet", href: "/financials/balance-sheet" }],
  },

  // ── Part 3 · Your Role ───────────────────────────────────────────────────
  {
    id: "role",
    part: "role",
    title: "Your Role and the First 90 Days",
    minutes: 5,
    summary: "What the team does, what you'll own, and how the handover from EisnerAmper runs",
    handbook: "Section 4",
    blocks: [
      { t: "p", text: "The accounting team keeps the books current in Skyline (close around the 20th), pays the bills through Avid every Wednesday, reports monthly on every property and fund, bills tenants (with a yearly true-up), and manages cash and debt." },
      { t: "key", text: "You own the recurring accounting: reconciliations, payroll and allocation entries, workpapers, year-end support and the annual 1099 process. Questions go to Drew first." },
      { t: "p", text: "Today EisnerAmper, our outside accounting firm, prepares the recurring work. Over 90 days it moves to you: by day 90 you prepare it and they review it." },
      { t: "steps", items: [
        { title: "Days 1–30 · Learn and shadow", text: "Entities, banks, loans, payroll and intercompany; Skyline and the JE templates; shadow the weekly meeting; two recs and one workpaper. Day 30 check" },
        { title: "Days 31–60 · Prepare, full review", text: "Monthly recs, payroll and allocation JEs, the first group of workpapers, a tax walkthrough. Day 60 check" },
        { title: "Days 61–90 · Own and sustain", text: "All recurring prep, draft adjusting entries, year-end tax support, update the procedures. Day 90 review" },
      ] },
      { t: "p", text: "Phases can move faster, or run longer on specific entities. Year-end close and the start of tax season fall inside this window. The 90-Day Plan tab on this page is your checklist — tick items off with Drew as you go." },
    ],
    portal: [],
  },

  // ── Part 4 · The Recurring Work ──────────────────────────────────────────
  {
    id: "rhythm",
    part: "work",
    title: "The Monthly Rhythm",
    minutes: 8,
    summary: "What happens when in a month, and the tasks with your name on them",
    handbook: "5.1",
    blocks: [
      { t: "steps", items: [
        { title: "1st · Open the month", text: "Rent roll import; Laser Statements run on the 1st–2nd" },
        { title: "By the 5th · Statements out", text: "Tenant monthly statements" },
        { title: "15th · Lender reports", text: "Liberty Bank report; the Lafayette Hill (9510) Cushman report" },
        { title: "20th · Close", text: "Verify every property is in balance, close the prior month, GL import for every property, allocate expenses and credit card charges" },
        { title: "Last Friday / end · Wrap up", text: "Print management fee checks; tenant group setup" },
      ] },
      { t: "table", head: ["When", "Your task", "Where"], rows: [
        ["Monthly", "Reconcile all bank statements", "Statements + Bank Recs"],
        ["Monthly", "Balance sheet recs: intercompany, A/R, A/P, loans", "Skyline TB / GL, Debt Tracker"],
        ["Monthly", "Payroll and allocation journal entries", "Payroll reports; the portal's payroll GL import file"],
        ["Monthly", "Post direct-pay mortgages; NI LLC principal and interest allocation (from Marie)", "Lender statements, Debt Tracker"],
        ["20th", "Before close: verify every property is in balance", "Skyline TB; portal Balance Sheet"],
        ["After 20th", "Review operating statements with Drew; make adjustments", "Operating Statements, Flags to Investigate"],
        ["Weekly (from day 31)", "Lead the status meeting with EisnerAmper", "Open-items list"],
        ["Quarterly", "Balance sheet workpapers; draft adjusting entries", "TB, GL; EisnerAmper templates"],
        ["Dec / Jan", "1099 vendor list, then file through track1099.com", "1099 Register"],
        ["Feb", "Start year-end workpapers once January closes", "EisnerAmper workpaper index"],
      ] },
      { t: "p", text: "Also as needed: TI draw requests to Liberty from our escrow balances (with Tanya), and default letters to delinquent tenants (with Greg)." },
      { t: "key", text: "The year has its fixed points: CAM recs and year-end adjustments by 4/30, distributions in April and October, budgets from 9/1, insurance renews in November, 1099s in January. The full calendar is in the handbook (5.1)." },
    ],
    portal: [{ label: "Balance Sheet", href: "/financials/balance-sheet" }, { label: "Flags to Investigate", href: "/financials/operating-statements/review" }],
  },
  {
    id: "intercompany",
    part: "work",
    title: "How Money Moves Between Entities",
    minutes: 7,
    interactive: "money-moves",
    summary: "The 2000 clearing loop, payroll, credit cards and management fees",
    handbook: "5.2",
    blocks: [
      { t: "p", text: "Payroll and shared costs are paid once by LIK Clearing (`2000`) and billed back to the buildings through AvidXchange. Buildings pay these like any vendor bill, so every intercompany charge leaves an invoice and a payment." },
      { t: "steps", items: [
        { title: "1 · Shared bill comes in", text: "Paid once, from 2000" },
        { title: "2 · Coded to an allocation", text: "`-9301` business parks · `-9302` shopping centers · `-9303` all properties" },
        { title: "3 · 2000 GL imported", text: "Monthly, January to the latest month, into the portal" },
        { title: "4 · Split by building", text: "Each account × the building's allocation %. Under $100 is held until it adds up" },
        { title: "5 · One invoice per building", text: "`AE` + code + MMYY, a PDF, each emailed to Avid on its own" },
        { title: "6 · Building pays 2000 back", text: "Vendor LIKM4, through AP. 2000 nets back to zero" },
      ] },
      { t: "p", text: "Steps 3–5 run automatically on the 2000 GL import; a month that doesn't tie to the GL is held for review." },
      { t: "table", head: ["Flow", "How it works", "Invoice #"], rows: [
        ["Payroll", "Billed to properties by each employee's allocation. Maintenance staff to `6030-8502` (recoverable), others `6010-8501`", "`PR` + code + MMYY + run"],
        ["Credit card", "Harry codes each charge to a property; one invoice per property (vendor LIKM1)", "`CC` + code + MMYY"],
        ["Management fees", "Each building books `6610`; 2010 books `4510` by two manual JEs. They must match every month", "JE"],
        ["Leasing commissions", "Billed at commission × 1.2, one invoice per deal", "`Q326ICom-…`"],
      ] },
      { t: "key", text: "6610 across the buildings must equal 4510 at 2010 every month. When they don't, the buildings' 6610 is the evidence and 4510 is corrected to it." },
    ],
    portal: [{ label: "Management Fees", href: "/financials/management-fees" }],
  },
  {
    id: "reporting",
    part: "work",
    title: "Monthly Reporting and Budgets",
    minutes: 7,
    summary: "One GL import builds every report — and how to read and review a statement",
    handbook: "5.3",
    blocks: [
      { t: "p", text: "After the Skyline close (~20th), each property's Detailed GL (January to the latest month) is imported into the portal. That one import builds the operating statement, Flags to Investigate, the reprojection, the T-12, the balance sheet and management fees." },
      { t: "table", head: ["Report", "What it shows"], rows: [
        ["Operating statement", "Month and YTD, actual vs budget, per property or fund"],
        ["Flags to Investigate", "Lines marked ? — off by $500+ and unusual — worked down to an empty list each month"],
        ["Reprojection", "Actual to date + budget for the rest of the year"],
        ["T-12", "The trailing twelve months, actuals only"],
        ["Balance sheet", "GL balances at any month, self-proving (assets = liabilities + capital)"],
      ] },
      { t: "points", items: [
        "NOI excludes capital and debt — both sit below the NOI line.",
        "Not posted (in amber) means a known obligation (taxes, insurance, management fee, mortgage) reads $0. Chase it first.",
        "GL TIES in the header means each uploaded file's activity rolls to its ending balances.",
        "A fund portfolio (PJV3 / PNIPLX) is its buildings consolidated.",
      ] },
      { t: "p", text: "Budgets are built September–December in the Budget Draft: rent from the rent roll and the leasing calls (Harry for shopping centers, Nancy for business parks), recoveries from each tenant's CAM methodology, taxes from public assessments, debt from the loans, payroll from the payroll budget, and everything else from the last twelve months + 3%. A published budget is what the statements compare against from January 1." },
    ],
    portal: [{ label: "Operating Statements", href: "/financials/operating-statements" }, { label: "Reprojections", href: "/financials/reprojections" }, { label: "T-12", href: "/financials/t12" }],
  },
  {
    id: "tenants",
    part: "work",
    title: "Tenants, CAM and Deposits",
    minutes: 8,
    summary: "What a tenant pays, how recoveries work by lease type, and the yearly true-up",
    handbook: "5.4",
    blocks: [
      { t: "p", text: "A tenant pays base rent plus monthly estimates of CAM, real estate tax (RET) and insurance (INS). The estimates are the tenant's recovery methodology applied to budgeted expenses, and each March / April they are trued up to actual in the CAM / RET reconciliation." },
      { t: "table", head: ["Property type", "Lease", "How recoveries work"], rows: [
        ["Shopping centers", "NNN", "Nearly all tenants pay their share of CAM, taxes and insurance through monthly estimates, trued up yearly"],
        ["Business parks", "Base year", "Tenants pay increases over their base year — for most, expense by expense, not as one total"],
        ["Korman Homes", "Gross", "Rent covers the costs; billbacks like lawn mowing can still apply"],
      ] },
      { t: "table", head: ["Topic", "How it works"], rows: [
        ["Rent roll", "Imported monthly from Skyline — the one source for who is where, SF and charges"],
        ["Open A/R", "The Laser Statement imported monthly (Receivables)"],
        ["CAM pool", "The building's `-8502` expenses (plus taxes and insurance) × each tenant's share, plus any admin fee, less what was billed"],
        ["Tenant methodology", "Share (PRS), admin fee, excluded lines, caps, gross lease — set per tenant on the unit page"],
        ["Year-end adjustments", "Two exports, SC and BP, posted 4/30 of the following year"],
        ["Move-outs", "Final bill = reconciliation + unpaid charges − deposit. Approved by Nancy (office) or Harry (retail); Tanya posts the charges"],
      ] },
      { t: "key", text: "Special cases: Parkwood (`7010`) has two CAM pools, retail and the upstairs office. Wawa at Lafayette Hill (`9510`) is billed quarterly. Butler & Main (`9000`) tenants are gross — no CAM." },
    ],
    portal: [{ label: "Rent Roll", href: "/rentroll" }, { label: "Unit Info", href: "/units" }, { label: "Receivables", href: "/tenant-statements" }],
  },
  {
    id: "taxes",
    part: "work",
    title: "Taxes, 1099s and Insurance",
    minutes: 6,
    summary: "The tax calendar by county, your 1099 process, and the insurance cycle",
    handbook: "5.5",
    blocks: [
      { t: "table", head: ["Where", "Real estate taxes"], rows: [
        ["Philadelphia", "One bill, due 3/31; paid by the end of February for the 1% discount"],
        ["Bucks", "County and township in April, school in August–September; paid early for 2%"],
        ["Montgomery", "County and municipal in spring, school in September; paid early for 2%"],
      ] },
      { t: "p", text: "Business taxes: Philadelphia BIRT and NPT; PA-65 / PA-40ES for Elbridge and Revere (April 15); the Bellmawr (`0800`) Net Profits Tax quarterly. EisnerAmper provides the figures. The Philadelphia properties also pay U&O tax monthly — Tanya updates it." },
      { t: "key", text: "1099s are yours, start to finish. They're built from CASH paid in the calendar year, totalled per filing entity (EIN) — not per property. The vendor list is prepared in December from the portal's 1099 Register and filed through track1099.com in January." },
      { t: "p", text: "Why per EIN matters: the eight NI LLC buildings are one filer. A vendor paid $250 by each of four of them is $1,000 to the filer — reportable, and invisible if you look building by building." },
      { t: "p", text: "Insurance renews in November. The broker's Statement of Values goes out in August, filled from Building Facts and the rent roll. The property premium sits in the INS pool (retail) or CAM (office); liability is a CAM line." },
    ],
    portal: [{ label: "1099 Register", href: "/financials/ten99" }],
  },
  {
    id: "eisner",
    part: "work",
    title: "Review, Workpapers and EisnerAmper",
    minutes: 5,
    summary: "How the work is reviewed and who does what after day 90",
    handbook: "5.6",
    blocks: [
      { t: "p", text: "EisnerAmper is our outside accounting firm. Over the transition, the prep moves to you; they keep reviewing it with written comments, join the weekly status and quarterly workpaper meetings, and coordinate with their tax team at year end." },
      { t: "table", head: ["Area", "You", "EisnerAmper"], rows: [
        ["Preparation", "Recs, payroll and allocation entries, workpapers, open-items lists, draft adjusting entries", "Training and guidance"],
        ["Review", "Answer comments and correct items", "Full review with written comments"],
        ["Tax", "Trial balances, schedules, support", "Coordinates with their tax team"],
        ["Meetings", "Lead the weekly status update", "Weekly and the quarterly workpaper review"],
      ] },
      { t: "steps", items: [
        { title: "Send and post", text: "Bank statements, payroll reports, loan and tax statements and insurance documents go out; agreed entries are posted" },
        { title: "Workpapers prepared", text: "Workpapers and recs are prepared; an open-items list goes out" },
        { title: "Resolve open items", text: "Both teams meet to resolve them" },
        { title: "Finalize", text: "Final adjusting entries post; workpapers are finalized" },
      ] },
      { t: "key", text: "Tell EisnerAmper promptly about any entry that touches a period they've already worked — a late change means redoing workpapers." },
      { t: "p", text: "Out of scope without Drew's written OK (billed hourly): budgeting, lender and investor reporting, cash management, financial statements and tax returns, historical cleanup, audit support, system changes and new entities." },
    ],
    portal: [],
  },
];

/** The handbook's 90-day checklist (4.3). Ticked with Drew; the three checks
 *  are the sit-down reviews between phases. */
export const CHECKLIST: { phase: string; items: { id: string; label: string; review?: boolean }[] }[] = [
  { phase: "Days 1–30 · Learn and shadow", items: [
    { id: "p1-entities", label: "Entities, banks, loans, payroll, intercompany" },
    { id: "p1-skyline", label: "Skyline and the JE templates" },
    { id: "p1-shadow", label: "Shadow the weekly meeting" },
    { id: "p1-recs", label: "Two recs and one workpaper" },
    { id: "p1-check", label: "Day 30 check", review: true },
  ] },
  { phase: "Days 31–60 · Prepare, full review", items: [
    { id: "p2-recs", label: "Monthly recs" },
    { id: "p2-jes", label: "Payroll and allocation JEs" },
    { id: "p2-wp", label: "Workpapers, first group" },
    { id: "p2-tax", label: "Tax walkthrough" },
    { id: "p2-check", label: "Day 60 check", review: true },
  ] },
  { phase: "Days 61–90 · Own and sustain", items: [
    { id: "p3-prep", label: "All recurring prep" },
    { id: "p3-aje", label: "Draft adjusting entries" },
    { id: "p3-ye", label: "Year-end tax support" },
    { id: "p3-proc", label: "Update the procedures" },
    { id: "p3-check", label: "Day 90 review", review: true },
  ] },
];

/** The handbook's glossary (6.1), for the Glossary tab's search. */
export const GLOSSARY: { group: string; terms: [string, string][] }[] = [
  { group: "Leases and recoveries", terms: [
    ["Base rent", "The rent set in the lease, before any recoveries"],
    ["CAM", "Common area maintenance: shared operating costs billed back to tenants"],
    ["CAM pool", "A building's reimbursable (-8502) expenses, plus taxes and insurance, shared among its tenants"],
    ["RET / INS", "Real estate tax / insurance recoveries"],
    ["Estimates", "The monthly CAM / RET / INS charges on a tenant's statement: their methodology applied to budgeted expenses"],
    ["CAM / RET reconciliation", "The annual true-up of estimates to actual, done in March / April"],
    ["Recovery methodology", "How a tenant's share is calculated: PRS, admin fee, excluded lines, caps or gross lease. Set on the unit page"],
    ["PRS", "Pro rata share: a tenant's SF ÷ the building's GLA, unless the lease sets it"],
    ["GLA", "Gross leasable area"],
    ["NNN", "Triple net: the tenant pays its share of CAM, taxes and insurance. Nearly all retail tenants"],
    ["Base year", "Office lease term: the tenant pays only the increase over that year, expense by expense for most"],
    ["Gross lease", "Rent includes the operating costs (residential, and Butler & Main)"],
    ["Escrow", "The monthly estimates a tenant is billed. Also lender escrow balances at Liberty, drawn for TI"],
    ["TI / LC", "Tenant improvements / leasing commissions"],
    ["Security deposits", "Tenant money, held in their own Liberty accounts"],
    ["U&O", "Use & Occupancy tax, paid monthly on the Philadelphia properties"],
  ] },
  { group: "Entities and structure", terms: [
    ["Property code", "The four-character code for each property, used in Skyline, the GL and the portal"],
    ["Book", "A group of properties: business parks, shopping centers, Korman Homes, The Office Works, land"],
    ["FJVIII / FNIPLX", "Fund codes for JV III and NI LLC"],
    ["PJV3 / PNIPLX / PHOMES", "Portfolio (rollup) statement keys: JV III, NI LLC, Korman Homes"],
    ["Holding entity", "The entity that holds a fund's mortgage: 3600 for JV III, 4000 for NI LLC"],
    ["Condo (3610A)", "The JV III condo entity; CAM for the JV III buildings runs through it"],
    ["2010 · LIK Management", "The management company entity. Books management fee revenue on 4510"],
    ["2000 · LIK Clearing", "Pays payroll and shared costs, then bills them back to the properties"],
    ["LIKM1 / LIKM4", "Vendor codes for LIK Management (credit card / everything else)"],
  ] },
  { group: "Accounts and codes", terms: [
    ["Major / suffix", "An account like 6220-8502: the major says what it is, the suffix says who pays"],
    ["-8502 / -8501", "Reimbursable (in the CAM pool) / not reimbursable (the owner's cost)"],
    ["-9301 / -9302 / -9303", "Allocation suffixes in 2000: business parks / shopping centers / all properties"],
    ["6610 / 4510", "Management fee expense at each building / revenue at 2010. Must match every month"],
    ["-FO / -CU", "Skyline unit suffixes: former occupant / current charges"],
  ] },
  { group: "Reporting and close", terms: [
    ["Close", "Closing the prior month in Skyline, around the 20th, after every property is verified in balance"],
    ["Detailed GL / TB", "The general ledger detail and trial balance exported from Skyline"],
    ["GL import", "Loading the Detailed GL into the portal; it builds every monthly report"],
    ["JE templates", "Upload files for posting journal entries into Skyline"],
    ["Flags to Investigate", "Lines off by $500+ and unusual, worked down to an empty list each month"],
    ["NOI", "Revenue − operating expenses, before capital and debt"],
    ["Reprojection", "Actual to date + budget for the rest of the year"],
    ["T-12", "Trailing twelve months of actuals"],
    ["Workpapers", "Balance sheet support per entity, tied to the TB and GL, quarterly and at year end"],
    ["Watch list", "Loans maturing by 3/2028"],
  ] },
  { group: "Taxes and investors", terms: [
    ["K-1", "A partner's share of a partnership's income, prepared by EisnerAmper's tax team"],
    ["Schedule E", "What the owners of 0900 Lincoln BLS receive instead of K-1s"],
    ["PA NR withholding", "PA nonresident tax paid for some partners of 7200 and 7300, recovered from their next distribution"],
    ["BIRT / NPT", "Philadelphia Business Income & Receipts Tax / Net Profits Tax"],
    ["1099 Register", "The portal report of cash paid to vendors in the calendar year"],
    ["Statement of Values", "A market-value view of each interest, prepared on request. Not a balance sheet"],
  ] },
];

/** Who takes the orientation and who can see their progress. */
export const ONBOARDING_LEARNERS = ["randy"] as const;
export const totalMinutes = () => MODULES.reduce((s, m) => s + m.minutes, 0);
