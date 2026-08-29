// Tiny shared depth counter so a full-screen panel's window-level Escape handler can bail when a
// dialog is stacked on top of it (two capture-phase listeners on `window` fire in registration
// order, so `stopPropagation` from the inner one is too late - the panel would already have
// closed). A dialog calls `pushModal()` on mount and the returned disposer on unmount; a panel
// checks `modalOpen()` before acting on Escape.

let depth = 0;

export function pushModal(): () => void {
  depth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
  };
}

export function modalOpen(): boolean {
  return depth > 0;
}
