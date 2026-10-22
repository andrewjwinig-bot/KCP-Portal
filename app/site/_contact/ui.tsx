// Shared pieces of the website's two forms (Contact, Maintenance): the class
// strings the vendor's shadcn Input / Textarea / Button resolved to, kept
// verbatim so the fields look exactly as they did, plus the two lucide icons
// only these forms use.

export const INPUT_CLASS =
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 flex h-9 w-full min-w-0 bg-transparent text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border-0 border-b-2 border-slate-300 rounded-none px-0 py-2 focus-visible:ring-0 focus-visible:border-slate-800 transition-colors";

export const TEXTAREA_CLASS =
  "placeholder:text-muted-foreground focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full bg-transparent text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm rounded-none border-2 border-slate-300 px-3 py-2 focus-visible:ring-0 focus-visible:border-slate-800 transition-colors";

export const BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shadow-xs h-9 has-[>svg]:px-3 bg-slate-800 hover:bg-slate-700 text-white py-3 px-8 uppercase tracking-wider font-medium text-sm transition-all hover:shadow-lg rounded-none";

/** Off-screen honeypot: people never see it, form-filling bots fill it. */
export function Honeypot() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

type P = { className?: string };
const base = {
  xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export const LoaderCircle = ({ className }: P) => (
  <svg {...base} className={`lucide lucide-loader-circle ${className ?? ""}`}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
);

export const CircleAlert = ({ className }: P) => (
  <svg {...base} className={`lucide lucide-circle-alert ${className ?? ""}`}>
    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
  </svg>
);
