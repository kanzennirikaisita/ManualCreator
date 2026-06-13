function getElementInfo(el) {
  if (!el) return null;
  const text = (el.innerText || el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    tagName: el.tagName || '',
    text,
    id: el.id || '',
    className: typeof el.className === 'string' ? el.className : '',
    ariaLabel: el.getAttribute?.('aria-label') || '',
    name: el.getAttribute?.('name') || '',
    title: el.getAttribute?.('title') || ''
  };
}

document.addEventListener('click', (event) => {
  if (!chrome?.runtime?.id) return;
  chrome.runtime.sendMessage({
    type: 'manualclip_click',
    click: {
      x: event.clientX,
      y: event.clientY,
      pageX: event.pageX,
      pageY: event.pageY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      element: getElementInfo(event.target)
    }
  }).catch(() => {});
}, true);
