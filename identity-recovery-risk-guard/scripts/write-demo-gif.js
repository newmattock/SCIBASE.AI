import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "docs", "demo.gif");

function u16(value) {
  return String.fromCharCode(value & 255, (value >> 8) & 255);
}

function color(r, g, b) {
  return String.fromCharCode(r, g, b);
}

function minCodeSize(colorCount) {
  return Math.max(2, Math.ceil(Math.log2(colorCount)));
}

function packCodes(codes, width) {
  let bits = 0;
  let bitCount = 0;
  const bytes = [];
  for (const code of codes) {
    bits |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      bytes.push(bits & 255);
      bits >>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) bytes.push(bits & 255);
  return bytes;
}

function imageData(indices, paletteSize) {
  const size = minCodeSize(paletteSize);
  const clear = 1 << size;
  const end = clear + 1;
  const width = size + 1;
  const codes = [clear];
  for (let index = 0; index < indices.length; index += 4) {
    if (index > 0) codes.push(clear);
    codes.push(...indices.slice(index, index + 4));
  }
  codes.push(end);
  const bytes = packCodes(codes, width);
  const blocks = [];
  for (let index = 0; index < bytes.length; index += 255) {
    const chunk = bytes.slice(index, index + 255);
    blocks.push(String.fromCharCode(chunk.length, ...chunk));
  }
  return String.fromCharCode(size) + blocks.join("") + "\x00";
}

function frame(width, height, indices, delayCs, paletteSize) {
  return [
    "\x21\xF9\x04\x04",
    u16(delayCs),
    "\x00\x00",
    "\x2C",
    u16(0),
    u16(0),
    u16(width),
    u16(height),
    "\x00",
    imageData(indices, paletteSize)
  ].join("");
}

function makeFrame(width, height, alertIndex) {
  const pixels = new Array(width * height).fill(0);
  const fill = (x0, y0, x1, y1, idx) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) pixels[y * width + x] = idx;
    }
  };

  fill(0, 0, width, Math.floor(height * 0.15), 1);
  fill(Math.floor(width * 0.04), Math.floor(height * 0.24), Math.floor(width * 0.30), Math.floor(height * 0.44), 2);
  fill(Math.floor(width * 0.37), Math.floor(height * 0.24), Math.floor(width * 0.63), Math.floor(height * 0.44), alertIndex);
  fill(Math.floor(width * 0.70), Math.floor(height * 0.24), Math.floor(width * 0.96), Math.floor(height * 0.44), 3);
  fill(Math.floor(width * 0.08), Math.floor(height * 0.60), Math.floor(width * 0.30), Math.floor(height * 0.72), 4);
  fill(Math.floor(width * 0.39), Math.floor(height * 0.60), Math.floor(width * 0.61), Math.floor(height * 0.72), 5);
  fill(Math.floor(width * 0.70), Math.floor(height * 0.60), Math.floor(width * 0.92), Math.floor(height * 0.72), 6);
  fill(Math.floor(width * 0.08), Math.floor(height * 0.84), Math.floor(width * 0.92), Math.floor(height * 0.90), alertIndex);
  return pixels;
}

const width = 960;
const height = 540;
const palette = [
  color(248, 250, 252),
  color(15, 23, 42),
  color(219, 234, 254),
  color(220, 252, 231),
  color(185, 28, 28),
  color(37, 99, 235),
  color(180, 83, 9),
  color(255, 255, 255)
].join("");

const gif = [
  "GIF89a",
  u16(width),
  u16(height),
  "\xF2\x00\x00",
  palette,
  "\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00",
  frame(width, height, makeFrame(width, height, 4), 85, 8),
  frame(width, height, makeFrame(width, height, 6), 85, 8),
  frame(width, height, makeFrame(width, height, 5), 85, 8),
  ";"
].join("");

writeFileSync(out, Buffer.from(gif, "binary"));
console.log(`wrote ${out}`);
