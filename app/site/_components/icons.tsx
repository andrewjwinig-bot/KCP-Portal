// Lucide icons used by the company website, inlined (the original site used
// lucide-react; we don't add the dependency for eight glyphs).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, className, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      {children}
    </svg>
  );
}

export const ChevronLeft = (p: P) => <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>;
export const ChevronRight = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
export const ChevronDown = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const ArrowRight = (p: P) => <Icon {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>;
export const ExternalLink = (p: P) => (
  <Icon {...p}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></Icon>
);
export const MapPin = (p: P) => (
  <Icon {...p}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></Icon>
);
export const Menu = (p: P) => <Icon {...p}><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></Icon>;
export const X = (p: P) => <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
export const Search = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
