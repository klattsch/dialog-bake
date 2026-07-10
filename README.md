# klattsch dialog-bake

Turn a CSV of dialog lines into WAV files with [klattsch](https://github.com/tgies/klattsch),
a primitive parallel-formant speech synthesizer (late-70s / early-80s tier).

This is an integration path that works for basically any engine. Unity, Unreal,
GameMaker, Ren'Py, whatever. Just keep a spreadsheet of lines, bake it, and put
the WAVs in there.

For Godot there is an editor addon that does this inside the editor:
[klattsch/godot](https://github.com/klattsch/godot). For live synthesis in web
games, see [klattsch/talking-npc](https://github.com/klattsch/talking-npc).

## Use

```bash
npm install
node bake.mjs dialog.csv out/
```

Each row becomes `out/<id>.wav` (48 kHz, 16-bit mono).

## The CSV

```csv
id,voice,mode,text
guard_halt,b95 r180,english,halt who goes there
robot_error,b110,phonemes,EH+20 R ER . EH-20 R ER . EH R ER
```

- **id**: output filename.
- **voice**: klattsch directives prepended to the line. This is how a character
  gets a consistent voice: `b95 r180` is a low slow guard, `b160 r240` a bright
  quick shopkeeper. Empty is fine.
- **mode**: `english` looks words up in the CMU Pronouncing Dictionary and fails
  with an error on words it does not know. `phonemes` passes the text through as
  an [ARPABET](https://en.wikipedia.org/wiki/ARPABET) phoneme string with full
  access to directives.
- **text**: the line.

The sample `dialog.csv` in this repo shows both modes, a pitch-contour error
beep, a ghost, and a three-voice choir stinger.

Directive cheat sheet: `b` base pitch (Hz or note name like `bC3`), `r` rate
(ms per phoneme), `v`/`w` vibrato depth/rate, `h` aspiration, `t` tilt,
`g` effort, `s` formant scale (bigger/smaller creature). Full table in the
[klattsch README](https://github.com/tgies/klattsch) and the syntax help at
[klatts.ch/play](https://klatts.ch/play/).

## Lip sync data

```bash
node bake.mjs --schedules dialog.csv out/
```

also writes `<id>.schedule.json` next to each WAV. Each event is
`{ atMs, target, transitionMs }`; `target` contains formant frequencies
(`F1`-`F3`), amplitudes, `F0`, and `voicing`. Interpolate between events at your
frame rate to derive mouth openness from amplitude, jaw and rounding hints from
`F1`/`F2`, and pitch. The talking faces in the
[klattsch app](https://klatts.ch/)'s video exports use these schedules.

## License

MIT. If you ship baked lines in your game, no attribution is required for the
audio itself; the WAVs are yours. If you redistribute the klattsch code, keep
its copyright notice and license text. A credit is appreciated either way:

> Speech synthesis by klattsch (https://klatts.ch)
