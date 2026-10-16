import type { Modifier } from '@dnd-kit/core';

/**
 * Centres the drag overlay on the pointer, wherever the card was grabbed (Board centres the card image
 * inside it, since dnd-kit sizes the overlay like the grabbed card). dnd-kit starts the overlay
 * at the dragged card's top-left corner (and a hovered hand card is grown, so that corner is far
 * from the pointer); this moves it so the pointer is always at its centre.
 */
export const centerOnPointer: Modifier = ({ activatorEvent, activeNodeRect, overlayNodeRect, transform }) => {
  if (!(activatorEvent instanceof MouseEvent) || !activeNodeRect || !overlayNodeRect) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - activeNodeRect.left - overlayNodeRect.width / 2,
    y: transform.y + activatorEvent.clientY - activeNodeRect.top - overlayNodeRect.height / 2,
  };
};
