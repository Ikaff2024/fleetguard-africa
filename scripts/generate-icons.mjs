/**
 * Génération des icônes d'application.
 *
 * Un PNG est écrit à la main plutôt que d'ajouter une bibliothèque de
 * traitement d'image : l'icône est un carré uni au monogramme, et `sharp` pèse
 * une trentaine de mégaoctets pour ce seul usage. Node sait déjà tout faire —
 * `zlib` pour la compression, `crc32` pour les sommes de contrôle.
 *
 * Les icônes ne changent qu'avec la marque : le script s'exécute à la demande
 * (`npm run icons`), pas à chaque build.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ORANGE = [234, 88, 12]; // orange-600, la couleur de marque
const WHITE = [255, 255, 255];

/**
 * Monogramme « FG » dessiné sur une grille de 12×12.
 *
 * Une police embarquée serait disproportionnée pour deux lettres ; la grille
 * reste lisible une fois mise à l'échelle, y compris à 48 pixels sur l'écran
 * d'accueil d'un téléphone d'entrée de gamme.
 */
const GLYPH = [
  '............',
  '.###...####.',
  '.#.....#....',
  '.#.....#....',
  '.###...#.##.',
  '.#.....#..#.',
  '.#.....#..#.',
  '.#.....####.',
  '............',
  '............',
  '............',
  '............',
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG couleur vraie, sans canal alpha : l'icône est pleine. */
function encodePng(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    // Type de filtre 0 (aucun) en tête de chaque ligne.
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 2; // couleur vraie
  ihdr[10] = 0; // compression standard
  ihdr[11] = 0; // filtrage standard
  ihdr[12] = 0; // pas d'entrelacement

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * `maskable` réserve une marge : Android recadre l'icône en cercle ou en
 * losange selon le lanceur, et un monogramme collé au bord serait rogné.
 */
function iconPixels(size, maskable) {
  const scale = maskable ? 0.6 : 0.78;
  const glyphSize = size * scale;
  const origin = (size - glyphSize) / 2;
  const cell = glyphSize / GLYPH.length;

  return (x, y) => {
    const col = Math.floor((x - origin) / cell);
    const row = Math.floor((y - origin) / cell);
    const inside = row >= 0 && row < GLYPH.length && col >= 0 && col < GLYPH[0].length;
    return inside && GLYPH[row][col] === '#' ? WHITE : ORANGE;
  };
}

const outputDir = path.join(process.cwd(), 'public');
mkdirSync(outputDir, { recursive: true });

const icons = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const icon of icons) {
  const png = encodePng(icon.size, iconPixels(icon.size, icon.maskable));
  writeFileSync(path.join(outputDir, icon.file), png);
  console.log(`  ${icon.file.padEnd(24)} ${icon.size}×${icon.size} — ${(png.length / 1024).toFixed(1)} Ko`);
}

console.log(`\n${icons.length} icônes écrites dans public/.`);
