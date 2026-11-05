/**
 * HeartGold's system and message font (font.narc 0, its glyphs as tools/idle/hgss_battle.py draws them into
 * font_message.png and font_healthbox.png: 16x16 cells, 32 a row, the glyph of character code c in cell c − 1; the codes
 * charmap.txt's), each character's code and width (widths[code − 1]).
 */
const GLYPHS: Record<string, [number, number]> = {
  '×': [0x176, 6], 'é': [0x188, 6], '$': [0x1a8, 7], '₱': [0x1a8, 7], '!': [0x1ab, 6], '?': [0x1ac, 6], ',': [0x1ad, 5], '.': [0x1ae, 5], '…': [0x1af, 6], '·': [0x1b0, 6], '/': [0x1b1, 6],
  '‘': [0x1b2, 5], '’': [0x1b3, 5], "'": [0x1b3, 5], '“': [0x1b4, 6], '”': [0x1b5, 6], '"': [0x1b5, 6], '(': [0x1b9, 6], ')': [0x1ba, 6], '♂': [0x1bb, 6], '♀': [0x1bc, 6], '+': [0x1bd, 6],
  '-': [0x1be, 6], '*': [0x1bf, 6], '#': [0x1c0, 6], '=': [0x1c1, 6], '&': [0x1c2, 6], '~': [0x1c3, 6], ':': [0x1c4, 5], ';': [0x1c5, 5], '@': [0x1d0, 6], '%': [0x1d2, 6], '_': [0x1e9, 6], ' ': [0x1de, 4],
};
for (let i = 0; i < 10; i++) GLYPHS[String(i)] = [0x121 + i, 6];
for (let i = 0; i < 26; i++) GLYPHS[String.fromCharCode(65 + i)] = [0x12b + i, 6];
const NARROW: Record<string, number> = { f: 5, i: 3, j: 5, l: 4 };
for (let i = 0; i < 26; i++) {
  const c = String.fromCharCode(97 + i);
  GLYPHS[c] = [0x145 + i, NARROW[c] ?? 6];
}

/** A line's glyphs (a character the font lacks: its letter without the accent, else a space). */
const glyphsOf = (text: string) => [...text.normalize('NFC')].map((c) => GLYPHS[c] ?? GLYPHS[c.normalize('NFD')[0]!] ?? GLYPHS[' ']!);

/** A line's width in the font. */
export const dsWidth = (text: string) => glyphsOf(text).reduce((w, [, n]) => w + n, 0);

/** Lines no wider than `width`, broken between words (a word too long for a line on its own). */
export function wrapDs(text: string, width: number): string[] {
  return text.split('\n').flatMap((para) => {
    const lines: string[] = [];
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && dsWidth(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    return [...lines, line];
  });
}

/**
 * Text in HGSS's font from x, y (game pixels), line by line 16 apart, in one of its colourings (`font`: the battle's
 * message box's, the healthbox's); `right`: right-aligned to x; `wrap`: broken into lines that wide.
 */
export function DsText({ text, x, y, font, right = false, wrap }: { text: string; x: number; y: number; font: string; right?: boolean; wrap?: number }) {
  return (
    <>
      {(wrap ? wrapDs(text, wrap) : text.split('\n')).map((line, row) => {
        let cx = right ? x - dsWidth(line) : x;
        return glyphsOf(line).map(([code, width], i) => {
          const at = cx;
          cx += width;
          const cell = code - 1;
          return <span key={`${row}:${i}`} className="absolute" style={{ left: at, top: y + row * 16, width: 16, height: 16, backgroundImage: `url(${font})`, backgroundPosition: `${-(cell % 32) * 16}px ${-Math.floor(cell / 32) * 16}px` }} />;
        });
      })}
    </>
  );
}
