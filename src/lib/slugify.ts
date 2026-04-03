export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
};

export const generateTimestampSlug = (): string => {
  return `artifact-${Date.now()}`;
};

export const disambiguateSlug = async (
  baseSlug: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> => {
  if (!(await exists(baseSlug))) return baseSlug;

  for (let i = 2; i <= 100; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }

  return generateTimestampSlug();
};
