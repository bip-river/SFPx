import { PRINTABLE_RANGES } from './pdf-font-coverage.js';

export function canPrint(codePoint) {
  let low = 0, high = PRINTABLE_RANGES.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [first, last] = PRINTABLE_RANGES[mid];
    if (codePoint < first) high = mid - 1;
    else if (codePoint > last) low = mid + 1;
    else return true;
  }
  return false;
}

// The distinct characters the permit PDF cannot print, in the order they appear. The PDF normalizes text the same
// way (NFC) and turns tabs and line breaks into spacing, so those are not reported.
export function unprintableCharacters(text) {
  const found = [];
  for (const character of String(text ?? '').normalize('NFC')) {
    if (character === '\t' || character === '\n' || character === '\r') continue;
    if (!canPrint(character.codePointAt(0)) && !found.includes(character)) found.push(character);
  }
  return found;
}

const codeLabel = character => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

// Invisible characters (such as a zero-width joiner) mean nothing in quotes, so they are named instead.
function describeCharacter(character) {
  if (/^[\p{C}\p{Z}]$/u.test(character)) return `an invisible character (${codeLabel(character)})`;
  if (/^\p{M}$/u.test(character)) return `the mark “◌${character}”`;
  return `“${character}”`;
}

// “🌲”, “🌲” or “東”, “a”, “b”, “c” or 2 other characters.
export function describeCharacters(characters) {
  const shown = characters.slice(0, 3).map(describeCharacter);
  const rest = characters.length - shown.length;
  if (rest) return `${shown.join(', ')} or ${rest} other character${rest === 1 ? '' : 's'}`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}` : shown[0] || '';
}

// One sentence a visitor can act on, or '' when everything prints.
export function unprintableMessage(label, text) {
  const characters = unprintableCharacters(text);
  if (!characters.length) return '';
  return `${label} can’t include ${describeCharacters(characters)} because the permit can’t print ${characters.length === 1 ? 'it' : 'them'}. Remove ${characters.length === 1 ? 'it' : 'them'} or type ${characters.length === 1 ? 'it' : 'them'} another way.`;
}
