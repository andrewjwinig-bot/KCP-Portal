"use client";

// Public, per-tenant CAM statement behind a signed link. No app chrome, no
// auth — the token in the URL is the credential (verified server-side). The
// statement body is shared with the (hidden, WIP) tenant portal shell.

import { useParams } from "next/navigation";
import LoadingState from "@/app/components/LoadingState";
import { useStatement, TenantStatementView, Centered, BRAND } from "./StatementView";

export default function TenantStatementPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const { data, error } = useStatement(token);

  if (error) return <Centered><div style={{ fontWeight: 700, fontSize: 18, color: BRAND }}>CAM Statement</div><p className="muted" style={{ marginTop: 8 }}>{error}</p></Centered>;
  // Branded "building skyline" loader while the statement is fetched, sized to
  // the same 860px column so the layout doesn't jump when it resolves.
  if (!data) return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 18px 60px" }}>
      <LoadingState status="Loading your statement…" context="Securely retrieving your CAM statement…" rows={4} columns={2} />
    </main>
  );

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 18px 60px" }}>
      <TenantStatementView token={token} data={data} header />
      <footer className="muted" style={{ fontSize: 12, marginTop: 40, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        Questions about your statement? Contact Korman Commercial Properties. This is a secure, private link — please don&rsquo;t forward it.
      </footer>
    </main>
  );
}
