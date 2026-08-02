/**
 * Trosmos OS — DOM utilities
 */

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function createEl(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'className' || k === 'class') el.className = v;
    else if (k === 'textContent') el.textContent = v;
    else if (k === 'innerHTML') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset' && v && typeof v === 'object') {
      Object.assign(el.dataset, v);
    } else if (k === 'style' && v && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (v !== undefined && v !== null && k !== 'children') {
      el.setAttribute(k, v);
    }
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (typeof c === 'string') el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  });
  return el;
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 50) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = performance.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(pending);
      pending = setTimeout(() => {
        last = performance.now();
        fn(...args);
      }, ms - (now - last));
    }
  };
}

export function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

export function trapFocus(container) {
  if (!container) return () => {};
  const focusable = () =>
    Array.from(
      container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const list = focusable();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKey);
  const prev = document.activeElement;
  const initial = focusable()[0];
  if (initial) initial.focus();

  return () => {
    container.removeEventListener('keydown', onKey);
    if (prev && typeof prev.focus === 'function') {
      try { prev.focus(); } catch { /* ignore */ }
    }
  };
}

export function announce(message, politeness = 'polite') {
  let region = document.getElementById('trosmos-live-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'trosmos-live-region';
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    document.body.appendChild(region);
  }
  region.setAttribute('aria-live', politeness);
  region.textContent = '';
  void region.offsetWidth;
  region.textContent = message;
}
