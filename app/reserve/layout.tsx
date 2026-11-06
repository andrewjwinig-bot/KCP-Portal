import type { Metadata } from "next";

// A public tenant form, reached from kormancommercial.com: its tab reads as
// the company's, not the portal's (the root layout's "KCP Portal").
export const metadata: Metadata = {
  title: "Reserve a Room | Korman Commercial Properties",
  description: "Korman Commercial Properties tenant services.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
