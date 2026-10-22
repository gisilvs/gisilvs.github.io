// Old figure and section links can point inside collapsed technical notes.
function revealLinkedContent() {
  const target = document.getElementById(location.hash.slice(1));
  if (!target) return;
  let details = target.closest('details');
  let opened = false;
  while (details) {
    if (!details.open) { details.open = true; opened = true; }
    details = details.parentElement.closest('details');
  }
  if (opened) requestAnimationFrame(() => target.scrollIntoView({block: 'start'}));
}

window.addEventListener('hashchange', revealLinkedContent);
revealLinkedContent();
