// A small set of line icons (24×24, rounded strokes, currentColor) so the
// interface looks the same on every phone instead of using emoji.
const P = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.4-8.6-9A4.6 4.6 0 0 1 12 6.6 4.6 4.6 0 0 1 20.6 11C19 15.6 12 20 12 20z"/>',
  coin: '<circle cx="12" cy="12" r="8.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="4.6" stroke="rgba(0,0,0,.3)" stroke-width="1.6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  infinity: '<path d="M12 12c-2-2.6-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.4-5.5 4z"/>',
  bolt: '<path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v5.2L5.3 17.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-3l-5.2-8.8V3.5"/><path d="M7.6 14.5h8.8"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.7 1.8-1.7h2a4 4 0 0 0 4-4C20.5 6.9 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="14.8" cy="7.8" r="1" fill="currentColor"/>',
  book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h13v15h-13a2 2 0 0 0-2 2z"/><path d="M4.5 20.5a2 2 0 0 1 2-2h13v2h-13"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-3.6-2.6-5.6-3.6-8.5-.4 2.2-1.6 3.4-2.9 4C11.6 8 10.4 5.4 8 3.5 8.4 7 6 9.5 6 15a6 6 0 0 0 6 6z"/>',
  sparkle: '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>',
  star: '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.6-5 2.6 1-5.6-4.1-3.9 5.6-.8z"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-5"/>',
  undo: '<path d="M9 14L4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>',
  next: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
  eraser: '<path d="M4 20h16"/><path d="M14.5 4.5l5 5-8.5 8.5H6.5l-2.5-2.5z"/><path d="M9.5 9.5l5 5"/>',
  replay: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 3h5"/>',
  pencil: '<path d="M4.5 19.5l1-4.5L16 4.5a2 2 0 0 1 3 3L8.5 18z"/><path d="M14 6.5l3 3"/>',
  steps: '<path d="M5 18.5h4v-4h4v-4h4v-4h3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  orbit: '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)"/>',
  trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5a2.5 2.5 0 0 0 3 3M16 6.5h3a2.5 2.5 0 0 1-3 3M12 13.5v3M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

export function icon(name, cls = "") {
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
}

// Fill every <i data-icon="name"> placeholder in the page.
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.className);
  });
}
