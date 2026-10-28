const conversationDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const messageDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const formatDate = (formatter: Intl.DateTimeFormat, iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatter.format(date);
};

/** 22/10/26 */
export const formatConversationDate = (iso: string): string =>
  formatDate(conversationDateFormatter, iso);

/** Oct 8, 2026, 10:23 PM */
export const formatMessageDate = (iso: string): string =>
  formatDate(messageDateFormatter, iso);

export const pluralize = (count: number, singular: string): string =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;
