/**
 * cs-test-dom.mjs — a minimal duck-typed DOM for the in-page WebView harnesses.
 *
 * The injected marketplace scripts (`webviewUsd.ts`, `webviewScripts.ai.ts`, …) are
 * plain JS strings that only ever run inside a third-party page on a phone. These
 * harnesses run them in `node:vm` against this stub instead, so the scripts are
 * exercised byte-for-byte as injected — not re-implemented in the test.
 *
 * The scripts never ask for more than what is implemented here: nodeType,
 * nodeValue, tagName, id, className, childNodes, parentNode/parentElement,
 * nextSibling/nextElementSibling, textContent (get/set), get/setAttribute,
 * style.setProperty/removeProperty, getBoundingClientRect,
 * document.querySelectorAll (tag or [attribute] selectors, comma-separated),
 * document.createTreeWalker(SHOW_TEXT, filterOrNull) and NodeFilter constants.
 *
 * Deliberately NOT a DOM implementation: no CSS engine, no bubbling, no
 * innerHTML. If a scenario needs a capability this stub lacks, extend this file
 * — every harness shares it, so the fake page stays consistent across scripts.
 */

export const NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };

export function makeText(value) {
  const node = { nodeType: 3, nodeValue: value, parentNode: null };
  // The split-span sweep walks el.nextSibling repeatedly and a text node can be
  // mid-chain, so text nodes need the same sibling accessor elements have.
  Object.defineProperty(node, "nextSibling", {
    get() {
      const p = node.parentNode;
      if (!p) return null;
      return p.childNodes[p.childNodes.indexOf(node) + 1] ?? null;
    },
  });
  Object.defineProperty(node, "parentElement", {
    get() {
      const p = node.parentNode;
      return p && p.nodeType === 1 ? p : null;
    },
  });
  return node;
}

function makeStyle() {
  const props = new Map();
  return {
    _props: props,
    setProperty(name, value) {
      props.set(name, String(value));
    },
    removeProperty(name) {
      props.delete(name);
    },
    getPropertyValue(name) {
      return props.get(name) ?? "";
    },
  };
}

export function makeElement(tagName, { id = "", className = "", top = 10, attrs = {} } = {}) {
  const attributes = { ...attrs };
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    id,
    className,
    childNodes: [],
    parentNode: null,
    attributes,
    style: makeStyle(),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    getBoundingClientRect: () => ({ top }),
    get parentElement() {
      const p = el.parentNode;
      return p && p.nodeType === 1 ? p : null;
    },
    get textContent() {
      return collectText(el).map((n) => n.nodeValue || "").join("");
    },
    set textContent(value) {
      el.childNodes = [];
      if (value !== "") appendChild(el, makeText(String(value)));
    },
    get firstChild() {
      return el.childNodes[0] ?? null;
    },
    get nextSibling() {
      const p = el.parentNode;
      if (!p) return null;
      return p.childNodes[p.childNodes.indexOf(el) + 1] ?? null;
    },
    get nextElementSibling() {
      let s = el.nextSibling;
      while (s && s.nodeType !== 1) s = s.nextSibling;
      return s;
    },
  };
  return el;
}

/** Attach `child` under `parent` and return it (the only mutation these scripts need). */
export function appendChild(parent, child) {
  child.parentNode = parent;
  parent.childNodes.push(child);
  return child;
}

export function collectText(root, out = []) {
  for (const child of root.childNodes) {
    if (child.nodeType === 3) out.push(child);
    else collectText(child, out);
  }
  return out;
}

export function collectElements(root, out = []) {
  for (const child of root.childNodes) {
    if (child.nodeType === 1) {
      out.push(child);
      collectElements(child, out);
    }
  }
  return out;
}

/** Supports "tag", "tagA,tagB", "[attr]" and "[attr=value]" — all these scripts use. */
export function querySelectorAll(root, selector) {
  const parts = String(selector)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return collectElements(root).filter((el) =>
    parts.some((part) => {
      const attr = /^\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]$/.exec(part);
      if (attr) {
        const name = attr[1];
        const want = attr[2] ?? attr[3];
        const have = el.getAttribute(name);
        return have !== null && (want === undefined || have === want);
      }
      return el.tagName === part.toUpperCase();
    })
  );
}

export function createTreeWalker(root, _whatToShow, filter) {
  const list = root.nodeType === 3 ? [root] : collectText(root);
  let i = 0;
  return {
    nextNode() {
      while (i < list.length) {
        const node = list[i++];
        if (!filter || filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT) return node;
      }
      return null;
    },
  };
}

/**
 * A page: <body> plus the recorder plumbing the harnesses assert against.
 * `cs` (window.__cs) is stubbed as a task registry the harness drives directly,
 * which is how the shared runtime heartbeat behaves.
 */
export function makePage({ cs = true, innerHeight = 800, href = "https://detail.1688.com/page.html" } = {}) {
  const body = makeElement("body");
  const doc = {
    body,
    documentElement: { clientHeight: innerHeight, childNodes: [] },
    hidden: false,
    querySelectorAll: (sel) => querySelectorAll(body, sel),
    createTreeWalker: (root, what, filter) => createTreeWalker(root ?? body, what, filter),
  };
  const timers = [];
  const intervals = [];
  const messages = [];
  const tasks = {};
  const observers = [];
  const win = {
    innerHeight,
    document: doc,
    ReactNativeWebView: { postMessage: (raw) => messages.push(JSON.parse(raw)) },
    setTimeout(fn, ms) {
      timers.push({ fn, ms, cleared: false });
      return timers.length;
    },
    clearTimeout(id) {
      const t = timers[id - 1];
      if (t) t.cleared = true;
    },
    setInterval(fn, ms) {
      intervals.push({ fn, ms, cleared: false });
      return intervals.length;
    },
    clearInterval(id) {
      const t = intervals[id - 1];
      if (t) t.cleared = true;
    },
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.target = null;
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
        observers.push(this);
      }
      disconnect() {
        this.target = null;
      }
    },
    Date: { now: () => 0 },
  };
  win.window = win;
  if (cs) {
    win.__cs = {
      add(name, opts) {
        tasks[name] = { ...opts, resets: 0, added: (tasks[name]?.added || 0) + 1 };
        return true;
      },
      reset(name) {
        if (tasks[name]) tasks[name].resets++;
        return true;
      },
      tasks,
    };
  }
  return { body, doc, win, timers, intervals, messages, tasks, observers, href };
}

/** The global object the injected script sees inside node:vm. */
export function makeSandbox(page) {
  const { win, doc, href } = page;
  return {
    window: win,
    document: doc,
    NodeFilter,
    location: { href },
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    setInterval: win.setInterval,
    clearInterval: win.clearInterval,
    MutationObserver: win.MutationObserver,
    console: { log() {}, warn() {}, error() {} },
    JSON,
    String,
    Number,
    Math,
    Array,
    Object,
    Set,
    Map,
    Boolean,
    Error,
    RegExp,
  };
}
