/** Formato de `quickReplyCategories` em GET /settings e GET /inbox. */
export type QuickReplyScript = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
};

export type QuickReplyCategoryDTO = {
  id: string;
  name: string;
  sortOrder: number;
  replies: QuickReplyScript[];
};

export function quickRepliesHaveScripts(
  categories: QuickReplyCategoryDTO[] | undefined | null,
): boolean {
  return (categories ?? []).some((c) => c.replies.length > 0);
}
