export const extractTitle = (html: string): string | null => {
  // Try <title> tag first
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/\s+/g, ' ').trim();
    if (title) return title;
  }

  // Fall back to first <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    // Strip any inner HTML tags
    const h1Text = h1Match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (h1Text) return h1Text;
  }

  return null;
};
