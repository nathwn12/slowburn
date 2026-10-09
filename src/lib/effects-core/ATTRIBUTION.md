# effects-core — attribution

This directory is a vendored copy of the pure, host-agnostic effects core from
`slowed-reverb-player/src` (MIT). It is consumed by `src/lib/effects.ts` inside
the Museeks (Slowburn fork) frontend. The copied files are otherwise
unmodified apart from the attribution headers below.

## `dattorro.ts`

Dattorro plate-reverb parameter map + portable `AudioWorkletProcessor` source.
The processor source imitates pear-desktop
`src/plugins/player-actions/slowed-reverb/worklet.ts` (direct `wetGain`
writes, early-return silence while `wetGain === 0`, `dispose` support), kept
as a JS string so any `AudioContext.audioWorklet` host can load it from a
Blob URL.

## `slowed.ts`

Slowed-speed / reverb-intensity clamps and settings. Host-agnostic subset of
`pear-desktop` `player-actions/slowed-reverb/engine.ts` (Source A) and
`slowed-reverb-audio/shared.js` (Source B).

## `loop.ts`, `saved.ts`

A-B section-loop engine and saved-loop persistence, ported from
`pear-desktop` `player-actions/section-repeat/` (Source A).

```
The MIT License (MIT)

Copyright (c) th-ch <th-ch@users.noreply.github.com> (https://github.com/pear-devs/pear-desktop)
Copyright (c) slowed-reverb-player authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
