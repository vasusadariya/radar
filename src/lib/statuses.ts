// Plain module (no drizzle imports) so client components can use it.
export const LEAD_STATUSES = [
  "NEW",
  "RESEARCHED",
  "CONTACTS_FOUND",
  "DRAFTED",
  "SENT",
  "REPLIED",
  "INTERVIEW",
  "OFFER",
  "DEAD",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  RESEARCHED: "Researched",
  CONTACTS_FOUND: "Contacts found",
  DRAFTED: "Drafted",
  SENT: "Sent",
  REPLIED: "Replied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  DEAD: "Dead",
};
