// src/app/(app)/employer/billing/page.tsx
// /employer/subscription is now the one canonical subscription/billing page
// (it's the hardcoded Stripe checkout/portal return URL and the
// SUBSCRIPTION_REQUIRED redirect target — see that page's own header comment).
// This route stays in place only so old links/bookmarks don't 404.

import { redirect } from "next/navigation";

export default function EmployerBillingRedirectPage() {
  redirect("/employer/subscription");
}
