# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Player, queue and settings share one 28px control height, so the header, transport and sidebar no longer disagree by a few pixels.
- Mini mode condenses the player card to two lines, leaving the queue the majority of the window; the A-B and Details toggles sit on the transport line instead of their own row.
- The Burn stepper's label column is measured in `em` off the theme's text size, so SLOW, REVERB, TEMPO and PITCH keep one shared column at every width.

### Fixed

- Track rows are reachable and moveable by keyboard, with the active row tracked through `aria-activedescendant`.

### Performance

- Test runs exclude renamed dependency trees, `dist`, logs and caches from collection and from the watcher. Unit discovery drops from 10.5s to 1.75s, and a full run finishes in about 47s instead of stalling.

## [0.23.7] - 2026-10-11

### Added

- Slow and reverb effects: per-track Slow + Reverb in fine steps with one-click reset to dry.
- A-B loop on the seek bar with instant entry, per-track saved loops that auto-apply, and a library view of looped tracks.
- Four-skin theme gallery (Light, Dark, Dark Warm, AMOLED) with a persistent choice that wins over the OS theme.
- Explicit queue view with drag-to-reorder, mini mode (`Ctrl+M`), custom frameless window with in-app menu bar, and multi-folder library.
- Queue/search/sorting polish, waveform seek bar, ReplayGain support, stop-after-current, sleep blocker, notifications, and update checker.

### Changed

- Windows 10/11 64-bit is now the only target; macOS and Linux builds are gone.
- English-only; other locales removed.

Releases before 0.23.7 are not itemised here; `git log` is the record.
