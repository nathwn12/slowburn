type MockCoverRule = {
  /** Substring matched against the track path. */
  match: string;
  /** Cover URL to return when matched. */
  cover: string;
  /** Optional artificial delay before resolving (ms). */
  delayMs?: number;
};

type MockCoverHooks = {
  rules?: Array<MockCoverRule>;
  accents?: Record<string, string>;
};

function hooks(): MockCoverHooks | undefined {
  return (
    globalThis as typeof globalThis & {
      __MUSEEKS_MOCK_COVER__?: MockCoverHooks;
    }
  ).__MUSEEKS_MOCK_COVER__;
}

export async function getCover(path: string): Promise<string | null> {
  const rule = hooks()?.rules?.find((candidate) =>
    path.includes(candidate.match),
  );

  if (rule === undefined) {
    return null;
  }

  if (rule.delayMs !== undefined && rule.delayMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, rule.delayMs));
  }

  return rule.cover;
}

export function averageAccentFromPixels(): string | null {
  return null;
}

export async function sampleCoverAccent(
  coverUrl: string,
): Promise<string | null> {
  return hooks()?.accents?.[coverUrl] ?? null;
}
