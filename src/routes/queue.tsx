import { createFileRoute } from '@tanstack/react-router';

/**
 * The Queue is the right column's default view. The root shell renders it
 * directly when the location is not a routed view (including `/queue`), so this
 * route exists to give the breadcrumb a real, typed link target.
 */
export const Route = createFileRoute('/queue')({
  component: ViewQueue,
});

function ViewQueue() {
  return null;
}
