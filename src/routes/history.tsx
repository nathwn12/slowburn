import { createFileRoute } from '@tanstack/react-router';

import History from '../components/History';
import { allTracksQuery } from '../lib/queries';
import queryClient from '../lib/query-client';

/**
 * Play history as a route-level view: every track with at least one
 * completed play, newest first.
 *
 * Like `/queue`, this outlet is the minimal-mode entry point: in full mode
 * the right column shows the Queue itself and this route is reached through
 * the header view switcher; in minimal mode the Queue column is hidden and
 * the history renders here, in the route outlet.
 */
export const Route = createFileRoute('/history')({
  component: ViewHistory,
  loader: async () => {
    await queryClient.prefetchQuery(allTracksQuery);
  },
});

function ViewHistory() {
  return <History />;
}
