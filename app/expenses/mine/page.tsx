"use client";
// My Card Charges — Greg's own credit-card charges (owner, 11/2026: "make a
// credit card page for Greg on his user profile and make him code all the
// charges with him as the user"). The same coding card as his dashboard, here
// with EVERY charge on his card (coded ones too, to fix). The server returns
// only his (`/api/expenses/working`, by Card Member) and he is emailed the
// itemized list when Harry imports a statement (`codingNotice.ts`). Tick CAM
// for a recoverable charge and attach its receipt; nothing goes to
// AvidXchange until every charge on the statement is coded.

import { PageHeader } from "@/app/components/PageHeader";
import ChargesToCodeCard from "@/app/dashboard/ChargesToCodeCard";

export default function MyCardChargesPage() {
  return (
    <main style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader
        title="My Card Charges"
        info={<>
          The charges on your credit card from the latest statement. For each one pick the property and
          category and say what it was for. Tick <b>CAM</b> when tenants should pay for it (it bills to the
          recoverable account) and attach its receipt — a CAM charge isn&apos;t finished without one.
          Each pick saves at once. Harry sends the batch once every charge is coded.
        </>}
      />
      <ChargesToCodeCard page />
    </main>
  );
}
