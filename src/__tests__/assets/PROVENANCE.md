# Test fixture audio — provenance

These MP3s are **locally synthesized test tones**, generated on this machine with
`ffmpeg` from the `sine` source filter. They contain no third-party or
copyrighted material and carry no license obligations.

Regenerate with:

```text
ffmpeg -y -f lavfi -i "sine=frequency=<Hz>:sample_rate=44100:duration=160" \
  -af "volume=0.35,afade=t=in:st=0:d=0.5,afade=t=out:st=159.0:d=1.0" \
  -ac 2 -b:a 128k <name>-blues.mp3
```

| File                 | Tone (Hz) |
| -------------------- | --------- |
| `whiskey-blues.mp3`  | 220       |
| `majestic-blues.mp3` | 330       |
| `romantic-blues.mp3` | 440       |

Constraints the fixtures must satisfy for the E2E specs:

- duration > ~65 s (the tempo/pitch spec seeks to 60 s and measures advance)
- non-silent (the A-B spec asserts `rms.peak > 0`)
- 44100 Hz, stereo, MP3 (matches the mocked track metadata)

They replaced three Pixabay-sourced tracks that were bundled without a
source/license record. The Pixabay Content License prohibits redistributing
content on a standalone basis (unmodified, no creative effort applied), which a
verbatim copy in a public repository is; the replacements remove that risk.
