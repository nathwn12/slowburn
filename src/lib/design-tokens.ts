/**
 * Canonical design-token names for the Slowburn theme system.
 *
 * Themes (`src/themes/*.json`) are the single source of truth: their
 * `variables` are written onto the DOM as CSS vars by
 * `SettingsAPI.applyThemeToUI`. This module carries no values - only the
 * token names and helpers to reference them - so components stop hardcoding
 * colors, spacing, radii, and type.
 *
 * NOTE: `tokenVar()` is for runtime/inline-style use only. Inside
 * `stylex.create()` calls, use literal `'var(--token)'` strings: StyleX is
 * compiled statically and cannot evaluate function calls.
 *
 * Legacy variables (e.g. `--button-bg`, `--main-color`, `--background`)
 * remain valid in the theme JSONs for existing call sites; new code should
 * prefer the canonical names below.
 */

export const tokenNames = [
  // Surfaces
  '--bg',
  '--surface',
  '--surface-2',
  '--surface-3',
  '--surface-hover',
  '--surface-elevated',
  '--surface-inset',
  // Glow + elevation (box-shadow values, non-text: no contrast pairs)
  '--shadow-elevated',
  '--glow-accent',
  '--glow-hover',
  '--glow-focus',
  // Borders
  '--border',
  '--border-soft',
  '--control-border',
  // Text ramp
  '--text',
  '--text-dim',
  '--text-faint',
  '--text-bright',
  // Brand accent (Slowburn magenta/rose)
  '--accent',
  '--accent-hover',
  '--accent-soft',
  '--accent-text',
  '--on-accent-ink',
  // Focus ring
  '--focus',
  '--focus-color',
  // Status sets
  '--success',
  '--success-soft',
  '--success-line',
  '--success-text',
  '--warn',
  '--warn-soft',
  '--warn-line',
  '--warn-text',
  '--danger',
  '--danger-soft',
  '--danger-line',
  '--danger-text',
  '--info',
  '--info-soft',
  '--info-line',
  '--info-text',
  // Slider / progress track
  '--track',
  // Radii: 6px controls, 10px panels
  '--radius',
  '--radius-sm',
  '--radius-lg',
  // Spacing scale: 4 / 8 / 12 / 16 / 24 / 32
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  // Row heights: comfortable 38px, compact 32px
  '--row',
  '--row-compact',
  // Type
  '--font-ui',
  '--mono-font',
  '--text-xs',
  '--text-sm',
  '--text-md',
  '--text-lg',
  '--weight-normal',
  '--weight-medium',
  '--weight-semibold',
] as const;

export type DesignTokenName = (typeof tokenNames)[number];

/**
 * Reference a token as a CSS `var()` expression, e.g. `var(--accent)`.
 * For runtime/inline-style use; see the module note about StyleX.
 */
export function tokenVar(name: DesignTokenName): string {
  return `var(${name})`;
}

/**
 * Read the live value of a token from the document root (after the active
 * theme has been applied). Returns `null` outside a DOM environment.
 */
export function readToken(name: DesignTokenName): string | null {
  if (typeof document === 'undefined') return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value === '' ? null : value;
}
