// The orientation's interactive lessons, by module id (lib/onboarding/modules.ts
// marks each with `interactive: true`). modules.test.ts checks every
// interactive module has its entry here.
import type { ComponentType } from "react";
import type { LessonProps } from "./kit";
import MoneyMoves from "./MoneyMoves";
import { CashDebt, Owners, Portfolio, Welcome } from "./CompanyLessons";
import { Accounts, PortalTour, Systems } from "./SystemsLessons";
import { Eisner, Reporting, Rhythm, Role, Taxes, Tenants } from "./WorkLessons";

export const LESSONS: Record<string, ComponentType<LessonProps>> = {
  welcome: Welcome,
  portfolio: Portfolio,
  "cash-debt": CashDebt,
  investors: Owners,
  systems: Systems,
  portal: PortalTour,
  accounts: Accounts,
  intercompany: MoneyMoves,
  role: Role,
  rhythm: Rhythm,
  reporting: Reporting,
  tenants: Tenants,
  taxes: Taxes,
  eisner: Eisner,
};
