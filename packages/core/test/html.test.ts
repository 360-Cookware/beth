import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractAnchors,
  htmlToInlineText,
  htmlToText,
  normalizeForMatch,
  parseListItems,
  parseTableRows,
} from '../src/text/html.js';

describe('html helpers', () => {
  it('decodes named, numeric and hex entities', () => {
    expect(decodeEntities('Saut&eacute; &amp; Sear &#8211; 500&deg;F &#x2122;')).toBe(
      'Sauté & Sear – 500°F ™',
    );
    expect(decodeEntities('&unknown;')).toBe('&unknown;');
  });

  it('converts block HTML to lines and drops scripts', () => {
    const html = '<p>One</p><script>alert(1)</script><ul><li>Two</li><li>Three</li></ul>';
    expect(htmlToText(html)).toBe('One\nTwo\nThree');
    expect(htmlToInlineText(html)).toBe('One Two Three');
  });

  it('parses table rows', () => {
    const html =
      '<table><tbody><tr><td>Oven Safe:&nbsp;<br></td><td>Up to 500°F<br></td></tr><tr><td>Gauge:</td><td>.110</td></tr></tbody></table>';
    expect(parseTableRows(html)).toEqual([
      ['Oven Safe:', 'Up to 500°F'],
      ['Gauge:', '.110'],
    ]);
  });

  it('parses list items from <li> and bullet paragraphs', () => {
    expect(parseListItems('<ul><li>A</li><li> B </li></ul>')).toEqual(['A', 'B']);
    expect(parseListItems('<p>Your pan includes:</p><p>• Pan</p><p>• Stainless Steel Cover</p>')).toEqual([
      'Pan',
      'Stainless Steel Cover',
    ]);
  });

  it('extracts anchors', () => {
    expect(extractAnchors('<a href="https://x.com/products/a-b"><u>A B</u></a>')).toEqual([
      { href: 'https://x.com/products/a-b', text: 'A B' },
    ]);
  });

  it('normalizes for matching', () => {
    expect(normalizeForMatch('3.5 Quart Sauté Pan & Cover')).toBe('3.5 quart saute pan and cover');
  });
});
