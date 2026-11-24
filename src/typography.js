// Keep short Russian prepositions and conjunctions with the following word.
export const bindShortWords = text => {
  const pattern = /(^|[\s«„(])(а|и|но|в|во|к|ко|с|со|у|о|об|обо|на|по|за|из|от|до|без|для|при|под|над|про|из-за|из-под)[ \t]+(?=\S)/giu;
  let previous;
  do { previous = text; text = text.replace(pattern, '$1$2\u00a0'); } while (text !== previous);
  return text;
};

export function installTypography(root = document.body) {
  const apply = () => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script, style, textarea, code, pre, [contenteditable]')) continue;
      const value = bindShortWords(node.data);
      if (node.data !== value) node.data = value;
    }
  };
  apply();
  // Accordions, building cards and navigation also insert text after page load.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; apply(); });
  }).observe(root, { subtree: true, childList: true, characterData: true });
}
