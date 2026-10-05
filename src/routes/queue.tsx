import { createFileRoute } from '@tanstack/react-router';

import Queue from '../components/Queue';
import { usePlayerState } from '../hooks/usePlayer';

/**
 * The Queue as a route-level view.
 *
 * In full mode the right column renders the Queue itself and this outlet is
 * never reached. In minimal mode (the default) the Queue column is hidden, so
 * the header's Queue item must still lead somewhere real: the queue renders
 * here, in the route outlet, instead of a blank screen. An empty queue renders
 * its empty state, so this view never looks empty either (design §3.4).
 */
export const Route = createFileRoute('/queue')({
  component: ViewQueue,
});

function ViewQueue() {
  const queue = usePlayerState((state) => state.queue);
  const queueCursor = usePlayerState((state) => state.queueCursor);

  return <Queue queue={queue} queueCursor={queueCursor} />;
}
