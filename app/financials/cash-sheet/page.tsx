import { redirect } from "next/navigation";

// The Cash Sheet and Cash Analysis were merged into one page. This route now
// redirects to the unified Cash Sheet (formerly "Cash Analysis"), which lists
// every property/entity bank account with its cash position — monthly GL
// actuals plus the weekly AvidXchange bridge. The old weekly worksheet lives in
// git history if its per-Wednesday detail is ever needed again.
export default function CashSheetRedirect() {
  redirect("/financials/cash-analysis");
}
