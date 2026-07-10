#!/usr/bin/env node
// Bake a CSV of dialog lines into one WAV per line.
//
//   node bake.mjs dialog.csv out/
//
// With --schedules, also write <id>.schedule.json next to each WAV (the
// compiled event list { atMs, target, transitionMs } with formants, F0, and
// amplitude), which lets you drive lip sync etc. in time with the audio.
//
// CSV columns: id, voice, mode, text
//   id     output filename (id.wav)
//   voice  directive prefix applied to the line, e.g. "b140 r220" (may be empty)
//   mode   "phonemes" (text is a klattsch phoneme string) or
//          "english"  (text is English words, looked up in the CMU dictionary)
//   text   the line

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileString, renderToBuffer, encodeWav } from 'klattsch';
import { textToPhonemes, hasWord } from 'klattsch/pronounce';

const SAMPLE_RATE = 48000;

const args = process.argv.slice(2);
const writeSchedules = args.includes('--schedules');
const [csvPath, outDir = 'out'] = args.filter(a => a !== '--schedules');
if (!csvPath) {
  console.error('usage: node bake.mjs [--schedules] <dialog.csv> [outdir]');
  process.exit(1);
}

// Minimal CSV parser
function parseCsv(src) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);  // drop blank lines
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);
  return rows;
}

function toPhonemeString(mode, text) {
  if (mode === 'phonemes') return text;
  if (mode === 'english') {
    const missing = text.split(/\s+/).filter(w => {
      const clean = w.replace(/[^a-zA-Z'-]/g, '');
      return clean && !hasWord(clean);
    });
    if (missing.length) {
      throw new Error(`words not in the CMU dictionary: ${missing.join(', ')}` +
        ' (spell them out in a "phonemes" row instead, or try a homophone)');
    }
    return textToPhonemes(text).map(p => p.code).join(' ');
  }
  throw new Error(`unknown mode "${mode}" (use "phonemes" or "english")`);
}

function renderLine(phonemeString) {
  const { voices, totalMs, warnings } = compileString(phonemeString);
  // Each [voice=N] section renders to its own buffer; sum them.
  // encodeWav peak-normalizes, so the sum is safe.
  const buf = new Float32Array(Math.ceil(totalMs * SAMPLE_RATE / 1000));
  for (const v of voices) {
    if (!v.schedule.length) continue;
    const vb = renderToBuffer({ sampleRate: SAMPLE_RATE, schedule: v.schedule, totalMs: v.totalMs });
    const n = Math.min(buf.length, vb.length);
    for (let i = 0; i < n; i++) buf[i] += vb[i];
  }
  return { buf, totalMs, warnings, voices };
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows.shift().map(h => h.trim().toLowerCase());
// column name -> index (-1 if absent)
const col = Object.fromEntries(['id', 'voice', 'mode', 'text'].map(k => [k, header.indexOf(k)]));
for (const k of ['id', 'mode', 'text']) {
  if (col[k] === -1) {
    console.error(`missing CSV column "${k}" (header is: ${header.join(', ')})`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const row of rows) {
  const id = row[col.id].trim();
  const voice = col.voice === -1 ? '' : row[col.voice].trim();
  const mode = row[col.mode].trim();
  const text = row[col.text].trim();
  try {
    const phonemeString = [voice, toPhonemeString(mode, text)].filter(Boolean).join(' ');
    const { buf, totalMs, warnings, voices } = renderLine(phonemeString);
    if (warnings.length) console.error(`${id}: ${warnings.join(', ')}`);
    const { bytes } = encodeWav(buf, SAMPLE_RATE, {
      metadata: { software: 'klattsch dialog-bake', comment: phonemeString },
    });
    const outPath = join(outDir, `${id}.wav`);
    writeFileSync(outPath, bytes);
    if (writeSchedules) {
      // keep only what animation needs
      const lean = voices.map(v => ({ totalMs: v.totalMs, schedule: v.schedule }));
      writeFileSync(join(outDir, `${id}.schedule.json`),
        JSON.stringify({ totalMs, voices: lean }));
    }
    console.log(`${outPath}  ${(totalMs / 1000).toFixed(2)}s`);
  } catch (err) {
    failed++;
    console.error(`${id}: ${err.message}`);
  }
}

if (failed) {
  console.error(`${failed} line(s) failed`);
  process.exit(1);
}
