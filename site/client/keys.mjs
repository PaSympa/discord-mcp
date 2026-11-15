export const isApple = (platform) => /Mac|iPhone|iPad|iPod/.test(platform);

/** Ctrl+K, or Cmd+K on Apple systems, opens the search. No single key does (WCAG 2.1.4). */
export const isSearchShortcut = ({ key, ctrlKey, metaKey, altKey, shiftKey }, apple) =>
  key?.toLowerCase() === "k" &&
  !altKey &&
  !shiftKey &&
  (apple ? Boolean(metaKey) && !ctrlKey : Boolean(ctrlKey) && !metaKey);
