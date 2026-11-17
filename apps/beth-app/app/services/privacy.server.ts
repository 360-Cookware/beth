/** Removes obvious personal data before a message is stored (architecture §8). */
export function scrubPii(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\s().-]?){7,}\d/g, '[phone]')
    .replace(
      /\b\d{1,5}\s+[A-Za-z0-9.\s]{2,40}\s(?:street|st|avenue|ave|road|rd|blvd|lane|ln|drive|dr)\b\.?/gi,
      '[address]',
    );
}
