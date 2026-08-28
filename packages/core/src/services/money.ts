/**
 * Which invoice states count as money owed.
 *
 * A draft has not been sent to anyone: nobody has been asked to pay it, so
 * counting it as receivable overstates what is coming in. Cancelled and paid
 * are self-evident.
 *
 * This lives in one place because it did not used to: the home page counted
 * everything except paid and cancelled — drafts included — while the reports
 * page summed sent, partial and overdue. The two pages printed different
 * numbers for the same word.
 */
export const OWED_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;

/** Filter selecting invoices that represent money owed. */
export function owedInvoiceFilter(): { status: { op: "in"; value: string[] } } {
  return { status: { op: "in", value: [...OWED_INVOICE_STATUSES] } };
}
