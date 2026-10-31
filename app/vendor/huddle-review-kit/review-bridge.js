// GENERATED from packages/review-kit (npm run build). Edit the source there, never this file.
"use strict";
(() => {
  // src/bridge/anchors.ts
  var BOX = { SECTION: 1, FIGURE: 1, ARTICLE: 1, ASIDE: 1, TABLE: 1, svg: 1, SVG: 1 };
  var PART_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
  var HEADING = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var BLOCK = {
    P: 1,
    LI: 1,
    H1: 1,
    H2: 1,
    H3: 1,
    H4: 1,
    H5: 1,
    H6: 1,
    TD: 1,
    TH: 1,
    FIGURE: 1,
    BLOCKQUOTE: 1,
    PRE: 1,
    SECTION: 1,
    ARTICLE: 1,
    svg: 1,
    SVG: 1
  };
  var LEAF = {
    P: 1,
    LI: 1,
    H1: 1,
    H2: 1,
    H3: 1,
    H4: 1,
    H5: 1,
    H6: 1,
    TD: 1,
    TH: 1,
    DT: 1,
    DD: 1,
    BLOCKQUOTE: 1,
    PRE: 1,
    FIGCAPTION: 1,
    CAPTION: 1
  };
  function flat(s) {
    return (s || "").replace(/\s+/g, " ");
  }
  var Anchors = class {
    constructor(root, framed) {
      this.root = root;
      this.framed = framed;
    }
    inside(n) {
      return !!n && (this.framed || this.root.contains(n));
    }
    top(el) {
      return !el || el === this.root || el === document.body || el === document.documentElement;
    }
    // An id a renderer made up on each load (Mermaid's `mermaid-1791926520821-…`)
    // names nothing the next load will have.
    stable(id) {
      return !!id && !/\d{8,}/.test(id) && id.indexOf("~") < 0;
    }
    attr(el, a) {
      const v = el.getAttribute(a) || "";
      return PART_NAME.test(v) ? v : "";
    }
    /** Is it a named part (`data-hb-anchor`)? */
    isPart(el) {
      return !!this.attr(el, "data-hb-anchor");
    }
    named(el) {
      return !!this.nameOf(el);
    }
    // A <div> or the like that holds words itself (not only in child blocks)
    // and is laid out as a block: a card, a note, a mock-up line.
    ownWords(el) {
      for (let c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3 && /\S/.test(c.nodeValue || "")) {
          const d = typeof window.getComputedStyle === "function" ? getComputedStyle(el).display : "block";
          return d.indexOf("inline") !== 0 && d !== "contents";
        }
      }
      return false;
    }
    // The smallest text block around the hit (see the top), or null.
    leafOf(start) {
      for (let el = start; !this.top(el); el = el.parentElement) {
        if (el.namespaceURI === SVG_NS) {
          let svg = el;
          let part = null;
          let e = el;
          while (e && !this.top(e) && e.namespaceURI === SVG_NS) {
            if (!part && (this.isPart(e) || this.attr(e, "data-hb-text-id") || e.getAttribute("data-cid"))) part = e;
            if (e.tagName.toLowerCase() === "svg") svg = e;
            e = e.parentElement;
          }
          return part || svg;
        }
        if (this.attr(el, "data-hb-text-id")) return el;
        if (LEAF[el.tagName] || this.ownWords(el)) return el;
      }
      return null;
    }
    /** The block a comment pins to: the smallest text block around the hit,
     *  else the nearest element with a data-cid or a stable id, else the
     *  nearest block-level element (a position anchor). */
    blockOf(node) {
      const start = node && node.nodeType === 1 ? node : node && node.parentElement;
      const leaf = this.leafOf(start);
      if (leaf) return leaf;
      let el = start;
      let pos = null;
      while (!this.top(el)) {
        if (this.named(el)) return el;
        if (!pos && BLOCK[el.tagName]) pos = el;
        el = el.parentElement;
      }
      return pos;
    }
    step(el) {
      let n = 1;
      let sib = el;
      while (sib = sib.previousElementSibling) if (sib.tagName === el.tagName) n++;
      return el.tagName.toLowerCase() + "[" + n + "]";
    }
    nameOf(el) {
      return el.getAttribute("data-cid") || this.attr(el, "data-hb-anchor") || this.attr(el, "data-hb-text-id") || (this.stable(el.id) ? el.id : "");
    }
    /** Its own name, else `<id>~<path>` from the nearest named ancestor, else
     *  `~<path>` from the root. */
    idOf(el) {
      const id = this.nameOf(el);
      if (id) return id;
      const parts = [];
      let e = el;
      for (; !this.top(e) && !this.named(e); e = e.parentElement) parts.unshift(this.step(e));
      const p = (this.top(e) ? "" : this.nameOf(e)) + "~" + parts.join("/");
      return p.length <= 200 ? p : null;
    }
    find(id) {
      if (!id) return null;
      const cut = id.indexOf("~");
      if (cut >= 0) {
        let el = cut === 0 ? this.root : this.find(id.slice(0, cut));
        const parts = id.slice(cut + 1).split("/");
        for (let i = 0; el && i < parts.length; i++) {
          const m = /^([a-z0-9-]+)\[(\d+)\]$/.exec(parts[i]);
          if (!m) return null;
          let n = +m[2];
          let hit = null;
          for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
            if (c.tagName.toLowerCase() === m[1] && --n === 0) {
              hit = c;
              break;
            }
          }
          el = hit;
        }
        return el;
      }
      for (const a of ["data-cid", "data-hb-anchor", "data-hb-text-id"]) {
        const all = this.root.querySelectorAll("[" + a + "]");
        for (let j = 0; j < all.length; j++) if (all[j].getAttribute(a) === id) return all[j];
      }
      const byId = document.getElementById(id);
      return byId && this.inside(byId) && byId !== this.root ? byId : null;
    }
    /** What a tap on `target` (at client x/y) picks, or null: nothing on the
     *  page can be named there. A text block, else (no text block was hit)
     *  the part around it: a doc's section, the nearest named element. */
    pick(target, x, y) {
      const start = target.nodeType === 1 ? target : target.parentElement;
      const leaf = this.leafOf(start);
      if (!leaf && !this.framed && start === this.root) {
        const sec = this.sectionAt(y);
        if (sec) return { el: sec[0], els: sec, part: true, label: readable(sec[0]).slice(0, 80) || null };
      }
      const el = this.blockOf(target);
      if (!el || !this.idOf(el)) return null;
      const part = this.isPart(el);
      return { el, els: [el], part, label: part ? this.labelFor(el) : null };
    }
    /** On a memory doc: the heading above this point and its section (the
     *  heading, then every block up to the next heading of its level or higher). */
    sectionAt(y) {
      const kids = Array.prototype.slice.call(this.root.children);
      let at = -1;
      for (let i = 0; i < kids.length; i++) {
        if (!HEADING[kids[i].tagName] || !this.named(kids[i])) continue;
        if (kids[i].getBoundingClientRect().top <= y) at = i;
        else break;
      }
      return at < 0 ? null : this.sectionFrom(kids, at, 7);
    }
    // The section headed by kids[at], or else by the nearest named heading
    // above it whose level is under `below` (7: any).
    sectionFrom(kids, at, below) {
      for (; at >= 0; at--) {
        const h = HEADING[kids[at].tagName];
        if (h && h < below && this.named(kids[at])) break;
      }
      if (at < 0) return null;
      const level = HEADING[kids[at].tagName];
      const out = [kids[at]];
      for (let i = at + 1; i < kids.length; i++) {
        const h = HEADING[kids[i].tagName];
        if (h && h <= level) break;
        out.push(kids[i]);
      }
      return out;
    }
    sectionPick(sec) {
      return { el: sec[0], els: sec, part: true, box: true, label: readable(sec[0]).slice(0, 80) || null };
    }
    /** Is it a box (s10-hold)? A named part, a [data-cid], a section or a
     *  figure and the like, or an element with its own border or background. */
    isBox(el) {
      if (this.isPart(el) || el.getAttribute("data-cid") || BOX[el.tagName]) return true;
      if (typeof window.getComputedStyle !== "function") return false;
      const cs = getComputedStyle(el);
      if (cs.display.indexOf("inline") === 0 || cs.display === "contents") return false;
      const edge = ["Top", "Right", "Bottom", "Left"].some(function(k) {
        return parseFloat(cs["border" + k + "Width"]) > 0 && cs["border" + k + "Style"] !== "none";
      });
      const bg = cs.backgroundImage !== "none" || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor);
      return edge || bg;
    }
    /** The box a hold beside the text picks: the nearest box from `target`
     *  up (itself included); on a memory doc, the section at y. */
    boxAt(target, y) {
      if (!this.framed) {
        const sec = this.sectionAt(y);
        if (sec && (target === this.root || sec.some((e) => e.contains(target)))) return this.sectionPick(sec);
      }
      return this.boxFrom(target);
    }
    boxFrom(start) {
      for (let e = start; !this.top(e); e = e.parentElement) {
        if (e.namespaceURI === SVG_NS && e.tagName.toLowerCase() !== "svg" && !this.isPart(e)) continue;
        if (this.isBox(e) && this.idOf(e)) {
          const part = this.isPart(e);
          return { el: e, els: [e], part, box: true, label: part ? this.labelFor(e) : null };
        }
      }
      return null;
    }
    /** One level up from what is picked (a repeated tap): a block to its box,
     *  a box to the next box around it, a doc's block to its section and a
     *  section to the one around it. null: the whole page is next. */
    up(p) {
      if (!this.framed) {
        const kids = Array.prototype.slice.call(this.root.children);
        let at = -1;
        for (let i = 0; i < kids.length; i++) if (kids[i].contains(p.el)) {
          at = i;
          break;
        }
        if (at < 0) return null;
        const below = p.els.length > 1 || p.box && HEADING[p.el.tagName] ? HEADING[kids[at].tagName] || 7 : 7;
        const sec = this.sectionFrom(kids, below < 7 ? at - 1 : at, below);
        return sec ? this.sectionPick(sec) : null;
      }
      const r = p.el.getBoundingClientRect();
      for (let e = p.el.parentElement; !this.top(e); e = e.parentElement) {
        const b = this.boxFrom(e);
        if (!b) return null;
        const q = b.el.getBoundingClientRect();
        if (q.width > r.width + 1 || q.height > r.height + 1) return b;
        e = b.el;
      }
      return null;
    }
    /** A part's name for people: its data-hb-label, aria-label, an SVG
     *  <title>, else its first words. Display only. */
    labelFor(el) {
      const own2 = el.getAttribute("data-hb-label") || el.getAttribute("aria-label");
      if (own2 && own2.trim()) return flat(own2).trim().slice(0, 80);
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c.tagName.toLowerCase() === "title" && flat(c.textContent).trim()) return flat(c.textContent).trim().slice(0, 80);
      }
      return readable(el).slice(0, 60) || this.nameOf(el) || null;
    }
    /** `section#budget/p[1]`, for display only (never used to place anything). */
    pathOf(el) {
      const parts = [];
      while (el && el !== this.root && el !== document.body && parts.length < 6) {
        const tag = el.tagName.toLowerCase();
        if (el.id) {
          parts.unshift(tag + "#" + el.id);
          break;
        }
        let n = 1;
        let sib = el;
        while (sib = sib.previousElementSibling) if (sib.tagName === el.tagName) n++;
        parts.unshift(tag + "[" + n + "]");
        el = el.parentElement;
      }
      return parts.join("/");
    }
    /** The words a tap is about, as they read: a diagram's tapped node label
     *  (the nearest <g> with words), else the whole block's. */
    labelOf(target, el) {
      if (el.tagName.toLowerCase() === "svg") {
        for (let g = target; g && g !== el; g = g.parentNode) {
          const t = g.tagName;
          if (t && t.toLowerCase() === "g" && flat(g.textContent).trim()) return readable(g);
        }
      }
      return readable(el);
    }
    /** What carries over to this version (c1753 §4): the block is here and the
     *  exact words occur once in it = here; the block is here, the words are not
     *  (or not once) = changed; no block = gone. No fuzzy re-anchoring. */
    check(a) {
      const el = this.find(a.block);
      if (!el) return "gone";
      const x = flat(a.exact || "").trim().replace(/\s*\u2026$/, "");
      if (!x) return "here";
      const once = function(t) {
        let n = 0;
        let i = -1;
        while ((i = t.indexOf(x, i + 1)) >= 0) n++;
        return n === 1;
      };
      return once(flat(readable(el))) || once(flat(plain(el))) ? "here" : "changed";
    }
  };
  function flatMap(el) {
    let text = "";
    const at = [];
    let space = false;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (ours(n)) continue;
      const v = n.nodeValue || "";
      for (let i = 0; i < v.length; i++) {
        const ws = /\s/.test(v.charAt(i));
        if (ws && space) continue;
        space = ws;
        text += ws ? " " : v.charAt(i);
        at.push([n, i]);
      }
    }
    return { text, at };
  }
  function starts(t, x) {
    const out = [];
    for (let i = t.indexOf(x); i >= 0; i = t.indexOf(x, i + 1)) out.push(i);
    return out;
  }
  function quoteRange(el, exact, prefix, suffix) {
    const x = flat(exact).trim();
    if (!x) return null;
    const m = flatMap(el);
    let hits2 = starts(m.text, x);
    if (hits2.length > 1) {
      const pre = flat(prefix), suf = flat(suffix);
      hits2 = hits2.filter(function(i) {
        return (!pre || m.text.slice(Math.max(0, i - pre.length), i) === pre) && (!suf || m.text.slice(i + x.length, i + x.length + suf.length) === suf);
      });
    }
    if (hits2.length !== 1) return null;
    const a = m.at[hits2[0]], b = m.at[hits2[0] + x.length - 1];
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1] + 1);
    return r;
  }
  function flatOffset(el, range) {
    const pre = document.createRange();
    pre.setStart(el, 0);
    pre.setEnd(range.startContainer, range.startOffset);
    return flat(pre.toString()).length;
  }
  function readable(el) {
    let out = "";
    const gap = function() {
      if (out && !/\s$/.test(out)) out += " ";
    };
    const walk = function(n, shown) {
      if (n.nodeType === 3) {
        if (shown) out += n.nodeValue || "";
        return;
      }
      if (n.nodeType !== 1) return;
      const e = n;
      const tag = e.localName;
      if (tag === "script" || tag === "style" || tag === "template" || tag === "noscript" || tag === "title" || OURS[tag]) return;
      if (tag === "br") return gap();
      const cs = getComputedStyle(e);
      if (cs.display === "none") return;
      const own2 = cs.visibility !== "hidden" && cs.visibility !== "collapse";
      const apart = tag === "text" || cs.display !== "inline" && cs.display !== "contents";
      if (apart) gap();
      for (let c = e.firstChild; c; c = c.nextSibling) walk(c, own2);
      if (apart) gap();
    };
    walk(el, true);
    return flat(out).trim() || flat(plain(el)).trim();
  }
  var OURS = { "hb-del": 1, "hb-gone": 1 };
  function ours(n) {
    for (let e = n && (n.nodeType === 1 ? n : n.parentElement); e; e = e.parentElement) if (OURS[e.localName]) return true;
    return false;
  }
  function plain(el) {
    if (!el.querySelector || !el.querySelector("hb-del,hb-gone")) return el.textContent || "";
    const c = el.cloneNode(true);
    c.querySelectorAll("hb-del,hb-gone").forEach(function(x) {
      x.remove();
    });
    return c.textContent || "";
  }
  function clip(s, n) {
    if (s.length <= n) return s;
    const cut = s.slice(0, n);
    const sp = cut.lastIndexOf(" ");
    return (sp > n / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, "") + "…";
  }
  function textOf(el) {
    const t = el.querySelector && el.querySelector("hb-del,hb-gone") ? plain(el) : el.innerText || el.textContent || "";
    return t.replace(/\s+\n/g, "\n").trim();
  }
  function docSize() {
    const d = document.documentElement;
    const b = document.body;
    return {
      w: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth, 1),
      h: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight, 1)
    };
  }
  function pct(n) {
    if (!isFinite(n)) return 0;
    return Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
  }
  function pointAt(pageX, pageY) {
    const s = docSize();
    return { x: pct(pageX / s.w * 100), y: pct(pageY / s.h * 100), vw: window.innerWidth, vh: window.innerHeight };
  }
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return null;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + "#" + node.id);
        break;
      }
      const cls = (node.getAttribute("class") || "").trim().split(/\s+/)[0];
      if (cls) part += "." + cls;
      const up = node.parentElement;
      if (up) {
        let same2 = 0;
        let index = 0;
        for (let i = 0; i < up.children.length; i++) {
          const c = up.children[i];
          if (c.tagName === node.tagName) {
            same2++;
            if (c === node) index = same2;
          }
        }
        if (same2 > 1) part += ":nth-of-type(" + index + ")";
      }
      parts.unshift(part);
      node = up;
      depth++;
    }
    return parts.join(" > ").slice(0, 500);
  }

  // src/bridge/chip.ts
  var ACCENT = "#1659B5";
  var ON = "#FBFCFD";
  var HANDLE = 28;
  var NATIVE = 56;
  var H = 44;
  var EDGE = 8;
  var FOOT = 72;
  var GAP = 6;
  function placeChip(rects, w, vw, vh, mouse = false) {
    if (!rects.length) return null;
    let top = Infinity, bottom = -Infinity;
    rects.forEach(function(r) {
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
    if (bottom < 0 || top > vh) return null;
    if (mouse) {
      let my = bottom + GAP;
      if (my + H > vh - EDGE) my = top - GAP - H;
      if (my < EDGE) return null;
      const mend = rects[rects.length - 1].right;
      return { x: Math.max(EDGE, Math.min(mend - w / 2, vw - w - EDGE)), y: my };
    }
    const above = top >= NATIVE + EDGE;
    let y = bottom + HANDLE + (above ? 0 : NATIVE);
    if (y + H > vh - FOOT) {
      if (!above) return null;
      y = top - NATIVE - EDGE - H;
      if (y < EDGE) return null;
    }
    const end = rects[rects.length - 1].right;
    const x = Math.max(EDGE, Math.min(end - w / 2, vw - w - EDGE));
    return { x, y };
  }
  var Chip = class {
    constructor(press) {
      this.press = press;
      this.layer = null;
      this.btn = null;
      this.range = null;
      this.label = "";
      this.queued = false;
      this.fired = false;
      this.mouse = false;
      this.bg = ACCENT;
      this.fg = ON;
      this.radius = 2;
      const again = () => this.soon();
      window.addEventListener("scroll", again, true);
      window.addEventListener("resize", again);
    }
    /** The words on it ("Kommenter"), or "" for no chip at all. */
    setLabel(l) {
      this.label = l || "";
      if (!this.label) this.hide();
      else if (this.btn) this.btn.textContent = this.label;
    }
    on() {
      return !!this.label;
    }
    /** The host's look (hello `chipStyle`); absent, the accent, its ink and 2 px corners. */
    setStyle(c) {
      this.bg = c && c.bg || ACCENT;
      this.fg = c && c.fg || ON;
      this.radius = c && typeof c.radius === "number" && c.radius >= 0 ? Math.min(c.radius, 999) : 2;
      if (this.btn) this.paint(this.btn);
    }
    /** Put it next to these words: a finger's selection, or (`mouse`) a mouse's. */
    show(r, mouse = false) {
      if (!this.label) return;
      this.range = r.cloneRange();
      this.mouse = mouse;
      this.fired = false;
      this.place();
    }
    hide() {
      this.range = null;
      this.mouse = false;
      if (this.btn) this.btn.style.display = "none";
    }
    shown() {
      return !!this.btn && this.btn.style.display !== "none";
    }
    owns(t) {
      return !!this.layer && !!t && this.layer.contains(t);
    }
    button() {
      if (!this.layer || !this.layer.isConnected) {
        this.layer = document.createElement("div");
        this.layer.setAttribute("data-huddle-review-chip", "1");
        this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483000";
        document.documentElement.appendChild(this.layer);
        this.btn = null;
      }
      if (!this.btn) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-hb-chip", "1");
        b.textContent = this.label;
        b.style.cssText = // Inline and whole: the page's own CSS for a <button> must not reach it.
        "position:absolute;display:none;box-sizing:border-box;margin:0;height:" + H + "px;padding:0 16px;font:600 15px/1 Archivo,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:0;white-space:nowrap;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation";
        b.addEventListener("touchstart", function(e) {
          e.preventDefault();
        }, { passive: false });
        const go = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.fired || !this.shown()) return;
          this.fired = true;
          this.press();
        };
        b.addEventListener("pointerup", go);
        b.addEventListener("click", go);
        this.paint(b);
        this.layer.appendChild(b);
        this.btn = b;
      }
      return this.btn;
    }
    paint(b) {
      b.style.background = this.bg;
      b.style.color = this.fg;
      b.style.border = "2px solid " + this.fg;
      b.style.borderRadius = this.radius + "px";
    }
    /** The words it was shown for, still there? */
    words() {
      return this.range;
    }
    place() {
      if (!this.range) return;
      const b = this.button();
      const rs = Array.prototype.slice.call(this.range.getClientRects()).filter(function(q) {
        return q.width || q.height;
      });
      b.style.visibility = "hidden";
      b.style.display = "block";
      const w = b.offsetWidth;
      const p = placeChip(rs, w, document.documentElement.clientWidth || window.innerWidth, window.innerHeight, this.mouse);
      b.style.visibility = "";
      if (!p) {
        b.style.display = "none";
        return;
      }
      b.style.left = p.x + window.pageXOffset + "px";
      b.style.top = p.y + window.pageYOffset + "px";
    }
    soon() {
      if (this.queued || !this.range) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        this.place();
      });
    }
  };

  // src/bridge/data.ts
  var NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
  var MAX_BYTES = 256 * 1024;
  var MAX_ROWS = 2e3;
  var MAX_COLS = 64;
  var VALUE = 256;
  function flat2(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }
  function parseDatum(s) {
    const m = /^([^:]+):(\d{1,5})(?::(.{1,64}))?$/.exec((s || "").trim());
    if (!m || !NAME.test(m[1])) return null;
    const row = +m[2];
    return m[3] === void 0 ? { source: m[1], row } : { source: m[1], row, col: m[3] };
  }
  var Data = class {
    constructor(root, nameOf) {
      this.root = root;
      this.nameOf = nameOf;
      this.cache = /* @__PURE__ */ new Map();
    }
    /** Every figure that says it is a visual and has a name (its anchor). */
    figures() {
      return Array.prototype.slice.call(this.root.querySelectorAll("[data-hb-visual]")).filter((f) => !!this.nameOf(f));
    }
    sources(fig) {
      const had = this.cache.get(fig);
      if (had) return had;
      const out = [];
      const seen = {};
      fig.querySelectorAll("script[data-hb-source]").forEach(function(s) {
        const type = (s.getAttribute("type") || "").trim().toLowerCase();
        const name = (s.getAttribute("data-hb-source") || "").trim();
        if (type !== "application/json" || !NAME.test(name) || seen[name]) return;
        const title = flat2(s.getAttribute("data-hb-title")).slice(0, 120) || name;
        const text = s.textContent || "";
        if (text.length > MAX_BYTES) {
          seen[name] = 1;
          out.push({ name, title, rows: null, count: 0, big: true });
          return;
        }
        let rows;
        try {
          rows = JSON.parse(text);
        } catch (_) {
          return;
        }
        if (!Array.isArray(rows)) return;
        seen[name] = 1;
        const wide = rows.some(function(r) {
          return !!r && typeof r === "object" && (Array.isArray(r) ? r.length : Object.keys(r).length) > MAX_COLS;
        });
        if (rows.length > MAX_ROWS || wide) out.push({ name, title, rows: null, count: rows.length, big: true });
        else out.push({ name, title, rows, count: rows.length, big: false });
      });
      this.cache.set(fig, out);
      return out;
    }
    /** What there is, for the shell's Data button: no rows yet. */
    visuals(labelOf) {
      const vs = [];
      this.figures().forEach((f) => {
        const ss = this.sources(f);
        if (!ss.length) return;
        vs.push({
          block: this.nameOf(f),
          label: labelOf(f),
          sources: ss.map(function(s) {
            return s.big ? { name: s.name, title: s.title, rows: s.count, big: true } : { name: s.name, title: s.title, rows: s.count };
          })
        });
      });
      return vs;
    }
    figure(block) {
      return this.figures().find((f) => this.nameOf(f) === block) || null;
    }
    /** One source's rows, for the drawer (null: no such source, or too big). */
    rows(block, name) {
      const f = this.figure(block);
      const s = f ? this.sources(f).find(function(x) {
        return x.name === name;
      }) : null;
      return s && !s.big ? s.rows : null;
    }
    /** The mark under a press and its figure, when it names a cell of a source
     *  that figure has; else null (a plain part, as before). */
    at(target) {
      const mark = target && target.closest ? target.closest("[data-hb-datum]") : null;
      const fig = mark ? mark.closest("[data-hb-visual]") : null;
      if (!mark || !fig || !this.root.contains(fig) || !this.nameOf(fig)) return null;
      const d = parseDatum(mark.getAttribute("data-hb-datum"));
      const s = d ? this.sources(fig).find(function(x) {
        return x.name === d.source;
      }) : null;
      if (!d || !s) return null;
      const datum = d;
      const v = s.rows ? cell(s.rows, d.row, d.col) : void 0;
      if (v !== void 0) datum.value = v;
      return { mark, fig, datum };
    }
    /** Every mark that shows this cell (a whole row: each of its cells). */
    marks(block, d) {
      const f = this.figure(block);
      if (!f) return [];
      return Array.prototype.slice.call(f.querySelectorAll("[data-hb-datum]")).filter(function(m) {
        const x = parseDatum(m.getAttribute("data-hb-datum"));
        return !!x && x.source === d.source && x.row === d.row && (d.col === void 0 || x.col === void 0 || x.col === d.col);
      });
    }
  };
  function cell(rows, row, col) {
    const r = rows[row];
    if (col === void 0 || !r || typeof r !== "object") return void 0;
    let v;
    if (Array.isArray(r)) v = /^\d+$/.test(col) ? r[+col] : void 0;
    else v = Object.prototype.hasOwnProperty.call(r, col) ? r[col] : void 0;
    if (v === void 0) return void 0;
    return (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, VALUE);
  }

  // src/bridge/diff.ts
  var HTML_NS = "http://www.w3.org/1999/xhtml";
  var SKIP = { script: 1, style: 1, template: 1, noscript: 1, title: 1, head: 1, "hb-del": 1, "hb-gone": 1 };
  var OURS2 = { "hb-del": 1, "hb-gone": 1 };
  var INLINE = {
    a: 1,
    abbr: 1,
    b: 1,
    bdi: 1,
    bdo: 1,
    br: 1,
    cite: 1,
    code: 1,
    data: 1,
    dfn: 1,
    em: 1,
    i: 1,
    kbd: 1,
    label: 1,
    mark: 1,
    q: 1,
    s: 1,
    samp: 1,
    small: 1,
    span: 1,
    strong: 1,
    sub: 1,
    sup: 1,
    time: 1,
    u: 1,
    var: 1,
    wbr: 1,
    del: 1,
    ins: 1,
    font: 1,
    big: 1,
    tt: 1,
    nobr: 1,
    button: 1,
    output: 1,
    meter: 1,
    progress: 1,
    input: 1,
    select: 1,
    textarea: 1,
    option: 1,
    ruby: 1,
    rt: 1,
    rp: 1,
    math: 1
  };
  var FIG = { svg: 1, img: 1, video: 1, audio: 1, canvas: 1 };
  function local(e) {
    return (e.localName || "").toLowerCase();
  }
  function isBlock(e) {
    const t = local(e);
    return e.namespaceURI === HTML_NS && !INLINE[t] && !SKIP[t] && !FIG[t];
  }
  function own(el) {
    let s = "";
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) s += c.nodeValue || "";
      else if (c.nodeType === 1) {
        const e = c;
        const t = local(e);
        if (OURS2[t]) continue;
        if (SKIP[t] || FIG[t] || e.namespaceURI !== HTML_NS || t === "br" || isBlock(e)) s += " ";
        else s += own(e);
      }
    }
    return s;
  }
  function ownMap(el) {
    const raw = [];
    const pos = [];
    const walk = function(p) {
      for (let c = p.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const v = c.nodeValue || "";
          for (let i = 0; i < v.length; i++) {
            raw.push(v.charAt(i));
            pos.push([c, i]);
          }
        } else if (c.nodeType === 1) {
          const e = c;
          const t = local(e);
          if (OURS2[t]) continue;
          if (SKIP[t] || FIG[t] || e.namespaceURI !== HTML_NS || t === "br" || isBlock(e)) {
            raw.push(" ");
            pos.push(null);
          } else walk(e);
        }
      }
    };
    walk(el);
    let text = "";
    const at = [];
    let gap;
    for (let k = 0; k < raw.length; k++) {
      if (/\s/.test(raw[k])) {
        if (gap === void 0 || !gap && pos[k]) gap = pos[k];
        continue;
      }
      if (gap !== void 0 && text) {
        text += " ";
        at.push(gap);
      }
      gap = void 0;
      text += raw[k];
      at.push(pos[k]);
    }
    return { text, at };
  }
  function step(e) {
    let n = 1;
    for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.localName === e.localName) n++;
    return local(e) + "[" + n + "]";
  }
  function pathOf(e, root) {
    const parts = [];
    for (let x = e; x && x !== root; x = x.parentElement) parts.unshift(step(x));
    return parts.join("/");
  }
  function byPath(root, path) {
    if (!path) return root;
    let el = root;
    const parts = path.split("/");
    for (let i = 0; el && i < parts.length; i++) {
      const m = /^([^\[]+)\[(\d+)\]$/.exec(parts[i]);
      if (!m) return null;
      let n = +m[2];
      let hit = null;
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === m[1] && --n === 0) {
        hit = c;
        break;
      }
      el = hit;
    }
    return el;
  }
  function figName(e) {
    const own2 = e.getAttribute("aria-label") || e.getAttribute("alt") || e.getAttribute("title");
    if (own2 && own2.trim()) return flat(own2).trim();
    const t = e.querySelector("title");
    if (t && flat(t.textContent).trim()) return flat(t.textContent).trim();
    const fig = e.closest("figure");
    const cap = fig && fig.querySelector("figcaption");
    return cap ? flat(cap.textContent).trim() : "";
  }
  function figKey(e) {
    const t = local(e);
    if (t === "svg") return "svg:" + flat(e.outerHTML);
    if (t === "img") return "img:" + (e.getAttribute("src") || e.getAttribute("data-asset") || "") + "|" + (e.getAttribute("srcset") || "");
    if (t === "canvas") return "canvas:" + (e.getAttribute("width") || "") + "x" + (e.getAttribute("height") || "");
    const srcs = [e.getAttribute("src") || ""];
    e.querySelectorAll("source").forEach(function(s) {
      srcs.push(s.getAttribute("src") || "");
    });
    return t + ":" + srcs.join("|");
  }
  function units(root) {
    const out = [];
    const scan = function(p) {
      for (let c = p.firstElementChild; c; c = c.nextElementSibling) {
        const t = local(c);
        if (SKIP[t] || c.hasAttribute("data-huddle-review-layer")) continue;
        if (FIG[t]) {
          out.push({ el: c, fig: true, text: figName(c), key: figKey(c), path: pathOf(c, root) });
          continue;
        }
        if (c.namespaceURI !== HTML_NS) continue;
        if (isBlock(c)) {
          const w2 = flat(own(c)).trim();
          if (w2) out.push({ el: c, fig: false, text: w2, key: "t:" + w2, path: pathOf(c, root) });
        }
        scan(c);
      }
    };
    const w = flat(own(root)).trim();
    if (w) out.push({ el: root, fig: false, text: w, key: "t:" + w, path: "" });
    scan(root);
    return out;
  }
  function align(a, b) {
    const out = [];
    const run = function(a0, a1, b0, b1) {
      while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) out.push([a0++, b0++]);
      const tail = [];
      while (a0 < a1 && b0 < b1 && a[a1 - 1] === b[b1 - 1]) tail.unshift([--a1, --b1]);
      if (a0 < a1 && b0 < b1) {
        const ca = {}, cb = {}, at = {};
        for (let i = a0; i < a1; i++) {
          ca[a[i]] = (ca[a[i]] || 0) + 1;
          at[a[i]] = i;
        }
        for (let j = b0; j < b1; j++) cb[b[j]] = (cb[b[j]] || 0) + 1;
        const pairs = [];
        for (let j = b0; j < b1; j++) if (ca[b[j]] === 1 && cb[b[j]] === 1) pairs.push([at[b[j]], j]);
        pairs.sort(function(x, y) {
          return x[0] - y[0];
        });
        const keep = lis(pairs);
        if (keep.length) {
          let pa = a0, pb = b0;
          keep.forEach(function(p) {
            run(pa, p[0], pb, p[1]);
            out.push(p);
            pa = p[0] + 1;
            pb = p[1] + 1;
          });
          run(pa, a1, pb, b1);
        } else lcs(a0, a1, b0, b1);
      }
      tail.forEach(function(p) {
        out.push(p);
      });
    };
    const lcs = function(a0, a1, b0, b1) {
      const n = a1 - a0, m = b1 - b0;
      if (n * m > 4e6) return;
      const L = new Uint32Array((n + 1) * (m + 1));
      for (let i2 = n - 1; i2 >= 0; i2--) {
        for (let j2 = m - 1; j2 >= 0; j2--) {
          L[i2 * (m + 1) + j2] = a[a0 + i2] === b[b0 + j2] ? L[(i2 + 1) * (m + 1) + j2 + 1] + 1 : Math.max(L[(i2 + 1) * (m + 1) + j2], L[i2 * (m + 1) + j2 + 1]);
        }
      }
      let i = 0, j = 0;
      while (i < n && j < m) {
        if (a[a0 + i] === b[b0 + j]) {
          out.push([a0 + i, b0 + j]);
          i++;
          j++;
        } else if (L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1]) i++;
        else j++;
      }
    };
    run(0, a.length, 0, b.length);
    return out;
  }
  function lis(p) {
    const tails = [], prev = new Array(p.length);
    for (let k = 0; k < p.length; k++) {
      let lo = 0, hi = tails.length;
      while (lo < hi) {
        const mid = lo + hi >> 1;
        if (p[tails[mid]][1] < p[k][1]) lo = mid + 1;
        else hi = mid;
      }
      prev[k] = lo > 0 ? tails[lo - 1] : -1;
      tails[lo] = k;
    }
    const out = [];
    for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.unshift(p[k]);
    return out;
  }
  function words(s) {
    return s.split(" ").map(function(w) {
      return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    }).filter(Boolean);
  }
  function alike(x, y) {
    const a = words(x), b = words(y);
    if (!a.length || !b.length) return 0;
    const n = {};
    a.forEach(function(w) {
      n[w] = (n[w] || 0) + 1;
    });
    let same2 = 0;
    b.forEach(function(w) {
      if (n[w]) {
        n[w]--;
        same2++;
      }
    });
    return 2 * same2 / (a.length + b.length);
  }
  function tokens(s) {
    const out = [];
    (s.match(/\S+|\s+/g) || []).forEach(function(t) {
      if (/^\s/.test(t)) return void out.push(t);
      const lead = /^[(\[\u00AB\u201C"']+/.exec(t), tail = /[.,;:!?)\]\u00BB\u201D"']+$/.exec(t);
      const a = lead ? lead[0].length : 0, b = tail && tail.index >= a ? tail.index : t.length;
      if (a) out.push(t.slice(0, a));
      if (b > a) out.push(t.slice(a, b));
      if (b < t.length) out.push(t.slice(b));
    });
    return out;
  }
  function wordDiff(x, y) {
    const a = tokens(x), b = tokens(y);
    const n = a.length, m = b.length;
    if (n * m > 25e4) return [[-1, x], [1, y]];
    const L = new Uint32Array((n + 1) * (m + 1));
    for (let i2 = n - 1; i2 >= 0; i2--) for (let j2 = m - 1; j2 >= 0; j2--) {
      L[i2 * (m + 1) + j2] = a[i2] === b[j2] ? L[(i2 + 1) * (m + 1) + j2 + 1] + 1 : Math.max(L[(i2 + 1) * (m + 1) + j2], L[i2 * (m + 1) + j2 + 1]);
    }
    const ops = [];
    const add = function(k, t) {
      const last = ops[ops.length - 1];
      if (last && last[0] === k) last[1] += t;
      else ops.push([k, t]);
    };
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        add(0, a[i]);
        i++;
        j++;
      } else if (j < m && (i >= n || L[i * (m + 1) + j + 1] >= L[(i + 1) * (m + 1) + j])) {
        add(1, b[j]);
        j++;
      } else {
        add(-1, a[i]);
        i++;
      }
    }
    for (let k = 1; k < ops.length - 1; k++) {
      if (ops[k][0] === 0 && !/\S/.test(ops[k][1]) && ops[k - 1][0] !== 0 && ops[k + 1][0] !== 0) {
        ops.splice(k, 1, [-1, ops[k][1]], [1, ops[k][1]]);
      }
    }
    const tidy = [];
    for (let k = 0; k < ops.length; ) {
      if (ops[k][0] === 0) {
        tidy.push(ops[k++]);
        continue;
      }
      let del = "", ins = "";
      for (; k < ops.length && ops[k][0] !== 0; k++) {
        if (ops[k][0] < 0) del += ops[k][1];
        else ins += ops[k][1];
      }
      if (del) tidy.push([-1, del]);
      if (ins) tidy.push([1, ins]);
    }
    return tidy;
  }
  function compare(oldRoot, nowRoot) {
    const A = units(oldRoot), B = units(nowRoot);
    const pairs = align(A.map(function(u) {
      return u.key;
    }), B.map(function(u) {
      return u.key;
    }));
    const ma = new Array(A.length).fill(-1), mb = new Array(B.length).fill(-1);
    pairs.forEach(function(p) {
      ma[p[0]] = p[1];
      mb[p[1]] = p[0];
    });
    const loose = {};
    A.forEach(function(u, i2) {
      if (ma[i2] < 0) (loose[u.key] = loose[u.key] || []).push(i2);
    });
    B.forEach(function(u, j2) {
      const l = mb[j2] < 0 ? loose[u.key] : null;
      if (l && l.length) {
        const i2 = l.shift();
        ma[i2] = j2;
        mb[j2] = i2;
      }
    });
    const changes = [];
    const byNow = {};
    const gone2 = [];
    let i = 0, j = 0;
    const gap = function(i0, i1, j0, j1) {
      const ra = [], rb = [];
      for (let x = i0; x < i1; x++) if (ma[x] < 0) ra.push(x);
      for (let y = j0; y < j1; y++) if (mb[y] < 0) rb.push(y);
      const cand = [];
      const one = ra.length === 1 && rb.length === 1 && !A[ra[0]].fig && !B[rb[0]].fig;
      if (one) cand.push([1, ra[0], rb[0]]);
      else if (ra.length * rb.length <= 4e4) {
        ra.forEach(function(x) {
          rb.forEach(function(y) {
            if (A[x].fig !== B[y].fig) return;
            const s = A[x].fig ? local(A[x].el) === local(B[y].el) ? 1 : 0 : alike(A[x].text, B[y].text);
            if (s >= 0.5) cand.push([s, x, y]);
          });
        });
      }
      cand.sort(function(p, q) {
        return q[0] - p[0] || Math.abs(p[1] - i0 - (p[2] - j0)) - Math.abs(q[1] - i0 - (q[2] - j0));
      });
      const usedA = {}, usedB = {};
      cand.forEach(function(c) {
        if (usedA[c[1]] || usedB[c[2]]) return;
        usedA[c[1]] = usedB[c[2]] = 1;
        const o = A[c[1]], n = B[c[2]];
        byNow[c[2]] = o.fig ? { kind: "figure", old: o, now: n } : { kind: "changed", old: o, now: n, ops: wordDiff(o.text, n.text) };
        ma[c[1]] = c[2];
        mb[c[2]] = c[1];
      });
      rb.forEach(function(y) {
        if (!usedB[y]) byNow[y] = { kind: "added", now: B[y] };
      });
      ra.forEach(function(x) {
        if (usedA[x]) return;
        let after = j0 - 1;
        for (let k = x - 1; k >= i0; k--) if (usedA[k]) {
          after = ma[k];
          break;
        }
        gone2.push({ i: x, after });
      });
    };
    const kept = pairs.slice().sort(function(p, q) {
      return p[0] - q[0];
    });
    kept.forEach(function(p) {
      gap(i, p[0], j, p[1]);
      i = p[0] + 1;
      j = p[1] + 1;
    });
    gap(i, A.length, j, B.length);
    gone2.sort(function(p, q) {
      return p.after - q.after || p.i - q.i;
    });
    let g = 0;
    for (let y = -1; y < B.length; y++) {
      if (y >= 0 && byNow[y]) changes.push(byNow[y]);
      while (g < gone2.length && gone2[g].after === y) {
        const u = A[gone2[g].i];
        changes.push({ kind: "removed", old: u, after: y });
        g++;
      }
    }
    return { changes, now: B };
  }
  var EDGE2 = { added: "#0E7A4F", changed: "#1659B5", figure: "#1659B5" };
  var TINT = { added: "rgba(14,122,79,.10)", changed: "rgba(22,89,181,.08)", figure: "rgba(22,89,181,.08)" };
  var Diff = class {
    constructor(root) {
      this.root = root;
      this.layer = null;
      this.style = null;
      this.placed = [];
      this.inserted = [];
      this.queued = false;
      this.on = -1;
      this.ro = null;
      this.panel = null;
      this.labels = null;
      this.opened = [];
      // the <details> go() opened, closed again by clear()
      this.again = () => this.soon();
    }
    active() {
      return !!this.layer;
    }
    /** Is this node one of ours (a mark, a removed block, the figure panel)? */
    owns(n) {
      if (!n) return false;
      const e = n.nodeType === 1 ? n : n.parentElement;
      return !!e && (!!(this.layer && this.layer.contains(e)) || !!(this.panel && this.panel.contains(e)) || !!(e.closest && e.closest("hb-gone,hb-del")));
    }
    /** Compare, mark the page, and say what changed (null: this browser cannot parse). */
    show(oldHtml, nowHtml, labels) {
      this.clear();
      if (typeof DOMParser !== "function") return null;
      const P = new DOMParser();
      const oldDoc = P.parseFromString(oldHtml, "text/html"), nowDoc = P.parseFromString(nowHtml, "text/html");
      if (!oldDoc.body || !nowDoc.body) return null;
      this.labels = labels;
      const r = compare(oldDoc.body, nowDoc.body);
      this.mount();
      const ins = [];
      this.placed = r.changes.map((c) => {
        if (c.kind === "removed") {
          const el2 = this.gone(c, r.now, labels);
          return { c, el: el2 };
        }
        const el = byPath(this.root, c.now.path);
        if (c.kind === "changed" && el) this.words(el, c, ins);
        return { c, el };
      });
      const H2 = globalThis.Highlight, reg = globalThis.CSS && CSS.highlights;
      if (H2 && reg && ins.length) reg.set("hb-ins", new H2(...ins));
      this.place();
      return this.placed.map((p) => {
        const c = p.c;
        const u = c.kind === "removed" ? c.old : c.now;
        let w = u.text;
        if (c.kind === "changed") {
          const k = c.ops.findIndex(function(o) {
            return o[0] !== 0;
          });
          const before = c.ops.slice(0, k).map(function(o) {
            return o[1];
          }).join("");
          w = (before.length > 40 ? "…" + before.slice(-30).replace(/^\S*\s/, "") : before) + c.ops.slice(k).filter(function(o) {
            return o[0] >= 0;
          }).map(function(o) {
            return o[1];
          }).join("");
        }
        return { kind: c.kind, words: clip(flat(w).trim(), 90), shown: !!p.el };
      });
    }
    // A changed block's words: those taken out go in where they stood, struck
    // through; then those put in are painted (found again after: a word put in
    // can start right where one was taken out).
    words(el, c, ins) {
      let m = ownMap(el);
      if (m.text !== c.now.text) return;
      const ops = c.ops;
      const dels = [];
      let pos = 0;
      ops.forEach(function(o) {
        if (o[0] !== -1) {
          pos += o[0] === 0 || o[0] === 1 ? o[1].length : 0;
          return;
        }
        const t = o[1].trim();
        if (!t) return;
        const n = m.at.length;
        let k = pos;
        while (k < n && !m.at[k]) k++;
        const r = document.createRange();
        if (k < n) r.setStart(m.at[k][0], m.at[k][1]);
        else {
          let j = n - 1;
          while (j >= 0 && !m.at[j]) j--;
          if (j < 0) return;
          r.setStart(m.at[j][0], m.at[j][1] + 1);
        }
        r.collapse(true);
        const before = k > 0 && /\S/.test(m.text.charAt(k - 1)), after = k < n && /[^\s.,;:!?)\]\u00BB\u201D]/.test(m.text.charAt(k));
        dels.push({ at: r, text: (before ? " " : "") + t + (after ? " " : "") });
      });
      dels.reverse().forEach((d) => {
        const x = document.createElement("hb-del");
        x.textContent = d.text;
        d.at.insertNode(x);
        this.inserted.push(x);
      });
      if (dels.length) m = ownMap(el);
      pos = 0;
      ops.forEach(function(o) {
        if (o[0] === -1) return;
        if (o[0] === 0) {
          pos += o[1].length;
          return;
        }
        const s = pos + (o[1].length - o[1].replace(/^\s+/, "").length);
        const e = pos + o[1].replace(/\s+$/, "").length;
        pos += o[1].length;
        const a = m.at[s], b = m.at[e - 1];
        if (e <= s || !a || !b) return;
        const r = document.createRange();
        r.setStart(a[0], a[1]);
        r.setEnd(b[0], b[1] + 1);
        ins.push(r);
      });
    }
    // A removed block: a thin line where it stood, its words on a tap.
    gone(c, now, labels) {
      const prev = c.after >= 0 ? byPath(this.root, now[c.after].path) : null;
      const next = c.after + 1 < now.length ? byPath(this.root, now[c.after + 1].path) : null;
      const g = document.createElement("hb-gone");
      g.setAttribute("role", "button");
      g.setAttribute("tabindex", "0");
      g.setAttribute("aria-expanded", "false");
      const text = c.old.fig ? labels.figure : c.old.text;
      const head = document.createElement("hb-gone-h");
      head.textContent = labels.removed + ": «" + clip(text, 60) + "» " + labels.open;
      const old = document.createElement("hb-old");
      old.textContent = text;
      g.appendChild(head);
      g.appendChild(old);
      const flip = function(e) {
        e.preventDefault();
        e.stopPropagation();
        g.setAttribute("aria-expanded", String(g.getAttribute("aria-expanded") !== "true"));
      };
      g.addEventListener("click", flip);
      g.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") flip(e);
      });
      if (prev && prev !== this.root && prev.parentNode) prev.parentNode.insertBefore(g, prev.nextSibling);
      else if (next && next !== this.root && next.parentNode) next.parentNode.insertBefore(g, next);
      else this.root.appendChild(g);
      this.inserted.push(g);
      return g;
    }
    mount() {
      this.style = document.createElement("style");
      this.style.setAttribute("data-huddle-review", "1");
      this.style.textContent = "::highlight(hb-ins){background-color:rgba(14,122,79,.16);text-decoration:underline;text-decoration-color:#0E7A4F;text-decoration-thickness:2px;text-underline-offset:3px}hb-del{display:inline;opacity:.6;text-decoration:line-through;-webkit-user-select:none;user-select:none}hb-gone{display:block;margin:6px 0;padding:6px 8px;border:1px dashed currentColor;border-radius:2px;opacity:.75;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;cursor:pointer;-webkit-user-select:none;user-select:none}hb-gone-h{display:block}hb-old{display:none;margin:6px 0 0;text-decoration:line-through;white-space:pre-wrap}hb-gone[aria-expanded=true] hb-old{display:block}@media print{hb-gone,hb-del{display:none}}";
      (document.head || document.documentElement).appendChild(this.style);
      this.layer = document.createElement("div");
      this.layer.setAttribute("data-huddle-review-diff", "1");
      this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147482998";
      document.documentElement.appendChild(this.layer);
      window.addEventListener("scroll", this.again, true);
      window.addEventListener("resize", this.again);
      document.addEventListener("toggle", this.again, true);
      if (typeof ResizeObserver === "function" && document.body) {
        try {
          this.ro = new ResizeObserver(this.again);
          this.ro.observe(document.body);
        } catch (_) {
          this.ro = null;
        }
      }
    }
    soon() {
      if (this.queued || !this.layer) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        this.place();
      });
    }
    // An edge (and a light fill) by every added or changed block, a badge on a
    // changed figure. One hidden in a closed <details>: its summary gets the edge.
    place() {
      if (!this.layer) return;
      const sx = window.pageXOffset, sy = window.pageYOffset;
      this.placed.forEach((p, k) => {
        if (p.c.kind === "removed" || !p.el) return;
        let el = p.el;
        let inside = false;
        for (let d = el.closest("details:not([open])"); d; d = d.parentElement ? d.parentElement.closest("details:not([open])") : null) {
          const s = d.querySelector(":scope > summary");
          if (s && !s.contains(p.el)) {
            el = s;
            inside = true;
          }
        }
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) {
          if (p.box) p.box.style.display = "none";
          if (p.badge) p.badge.style.display = "none";
          return;
        }
        if (!p.box) {
          p.box = document.createElement("div");
          p.box.setAttribute("data-hb-change", p.c.kind);
          this.layer.appendChild(p.box);
        }
        const on = k === this.on;
        const w = on ? 5 : 3;
        p.box.style.cssText = "position:absolute;box-sizing:border-box;margin:0;padding:0;pointer-events:none;border-radius:2px;left:" + (r.left + sx - 8) + "px;top:" + (r.top + sy - 2) + "px;width:" + (r.width + 12) + "px;height:" + (r.height + 4) + "px;border-left:" + w + "px " + (inside ? "dotted " : "solid ") + EDGE2[p.c.kind] + ";" + (inside ? "" : "background:" + TINT[p.c.kind] + ";mix-blend-mode:multiply;") + (on ? "outline:2px solid " + EDGE2[p.c.kind] + ";outline-offset:2px;" : "");
        p.box.setAttribute("data-on", on ? "1" : "0");
        if (p.c.kind === "figure" && !inside) {
          if (!p.badge) {
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("data-hb-figure", String(k));
            b.textContent = this.labels ? this.labels.figure : "";
            const stop = function(ev) {
              ev.stopPropagation();
            };
            b.addEventListener("pointerdown", stop, true);
            b.addEventListener("pointerup", stop, true);
            b.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              this.figure(k);
            });
            this.layer.appendChild(b);
            p.badge = b;
          }
          p.badge.style.cssText = "position:absolute;pointer-events:auto;margin:0;cursor:pointer;min-height:32px;padding:0 10px;white-space:nowrap;border:1px solid #1659B5;border-radius:2px;background:#FFFFFF;color:#1659B5;font:700 12px/1 ui-sans-serif,system-ui,sans-serif;left:" + (r.left + sx + 4) + "px;top:" + (r.top + sy + 4) + "px";
        } else if (p.badge) p.badge.style.display = "none";
      });
    }
    /** Bring change `k` into view (opening a <details> it is in) and mark it the one looked at. */
    go(k) {
      const p = this.placed[k];
      if (!p || !p.el) return;
      this.on = k;
      for (let d = p.el.closest("details"); d; d = d.parentElement ? d.parentElement.closest("details") : null) {
        if (!d.open) {
          d.open = true;
          this.opened.push(d);
        }
      }
      p.el.scrollIntoView({ block: "center" });
      if (p.c.kind === "removed") p.el.setAttribute("aria-expanded", "true");
      this.place();
    }
    // A changed figure, before and after: side by side on a wide frame; on a
    // phone one over the other, and a slider shows more of either.
    figure(k) {
      const p = this.placed[k];
      const L = this.labels;
      if (!p || !p.el || !p.c.old || !L) return;
      this.closePanel();
      const fit = function(e) {
        const x2 = document.importNode(e, true);
        [x2].concat(Array.prototype.slice.call(x2.querySelectorAll("*"))).forEach(function(n) {
          for (let i = n.attributes.length - 1; i >= 0; i--) if (/^on/i.test(n.attributes[i].name)) n.removeAttribute(n.attributes[i].name);
          if (local(n) === "script") n.remove();
        });
        x2.style.cssText = "display:block;max-width:100%;width:100%;height:auto;max-height:45vh;margin:0;object-fit:contain";
        return x2;
      };
      const before = fit(p.c.old.el), after = fit(p.el);
      const panel = document.createElement("hb-figview");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", L.beforeAfter);
      panel.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483001;display:block;max-height:75vh;overflow:auto;box-sizing:border-box;padding:12px 14px 14px;background:#FFFFFF;color:#14191F;border-top:1px solid #B9C3CE;font:14px/1.4 ui-sans-serif,system-ui,sans-serif";
      const head = document.createElement("hb-fighead");
      head.style.cssText = "display:flex;align-items:center;gap:8px;margin:0 0 8px;font-weight:700";
      const title = document.createElement("span");
      title.style.cssText = "flex:1";
      title.textContent = L.beforeAfter + (p.c.now && p.c.now.text ? ": " + clip(p.c.now.text, 50) : "");
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = L.close;
      x.style.cssText = "min-height:40px;padding:0 12px;border:1px solid #B9C3CE;border-radius:2px;background:#FFFFFF;color:#14191F;font:700 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer";
      x.addEventListener("click", () => this.closePanel());
      head.appendChild(title);
      head.appendChild(x);
      panel.appendChild(head);
      const cap = function(t) {
        const c = document.createElement("hb-figcap");
        c.style.cssText = "display:block;margin:0 0 4px;color:#5B6672;font-size:12px";
        c.textContent = t;
        return c;
      };
      if (window.innerWidth >= 600) {
        const row = document.createElement("hb-figrow");
        row.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px";
        [[L.before, before], [L.after, after]].forEach(function(s) {
          const col = document.createElement("hb-figcol");
          col.style.cssText = "display:block;min-width:0";
          col.appendChild(cap(s[0]));
          col.appendChild(s[1]);
          row.appendChild(col);
        });
        panel.appendChild(row);
      } else {
        const box = document.createElement("hb-figslide");
        box.style.cssText = "position:relative;display:block;overflow:hidden";
        const top = document.createElement("hb-figold");
        top.style.cssText = "position:absolute;inset:0;display:block;background:#FFFFFF";
        top.appendChild(before);
        const line = document.createElement("hb-figline");
        line.style.cssText = "position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;display:block;background:#14191F";
        box.appendChild(after);
        box.appendChild(top);
        box.appendChild(line);
        const range = document.createElement("input");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.value = "50";
        range.setAttribute("aria-label", L.drag);
        range.style.cssText = "display:block;width:100%;min-height:40px;margin:8px 0 0";
        const set = function() {
          top.style.clipPath = "inset(0 0 0 " + range.value + "%)";
          line.style.left = range.value + "%";
        };
        range.addEventListener("input", set);
        set();
        panel.appendChild(cap(L.slideNote));
        panel.appendChild(box);
        panel.appendChild(range);
      }
      const stop = function(ev) {
        ev.stopPropagation();
      };
      panel.addEventListener("pointerdown", stop, true);
      panel.addEventListener("pointerup", stop, true);
      document.documentElement.appendChild(panel);
      this.panel = panel;
    }
    closePanel() {
      if (this.panel && this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
      this.panel = null;
    }
    /** Off: every mark gone, the page's words as they were, and a <details> go() opened closed again. */
    clear() {
      this.closePanel();
      const reg = globalThis.CSS && CSS.highlights;
      if (reg) reg.delete("hb-ins");
      this.inserted.forEach(function(x) {
        const p = x.parentNode;
        if (!p) return;
        p.removeChild(x);
        if (local(x) === "hb-del") p.normalize();
      });
      this.inserted = [];
      this.opened.forEach(function(d) {
        d.open = false;
      });
      this.opened = [];
      if (this.layer && this.layer.parentNode) this.layer.parentNode.removeChild(this.layer);
      if (this.style && this.style.parentNode) this.style.parentNode.removeChild(this.style);
      if (this.layer) {
        window.removeEventListener("scroll", this.again, true);
        window.removeEventListener("resize", this.again);
        document.removeEventListener("toggle", this.again, true);
        if (this.ro) this.ro.disconnect();
      }
      this.ro = null;
      this.layer = null;
      this.style = null;
      this.placed = [];
      this.on = -1;
    }
  };

  // src/bridge/edit.ts
  var ACCENT2 = "#1659B5";
  var ON2 = "#FBFCFD";
  var INK = "#192029";
  var LINE = "#858F9B";
  var GAP2 = 6;
  var EDGE3 = 8;
  var DOC_TEXT = { P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1 };
  function style(primary, h) {
    return "position:absolute;display:none;box-sizing:border-box;margin:0;height:" + h + "px;padding:0 14px;" + (primary ? "background:" + ACCENT2 + ";color:" + ON2 + ";border:2px solid " + ON2 + ";" : "background:" + ON2 + ";color:" + INK + ";border:1px solid " + LINE + ";") + "border-radius:2px;font:600 15px/1 Archivo,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:0;white-space:nowrap;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation";
  }
  var fading = /* @__PURE__ */ new WeakMap();
  function gone(b) {
    if (!b || b.style.display === "none") return;
    b.style.opacity = "0";
    clearTimeout(fading.get(b));
    fading.set(b, setTimeout(function() {
      b.style.display = "none";
      b.style.opacity = "";
    }, 400));
  }
  var Editor = class {
    constructor(ask, told) {
      this.ask = ask;
      this.told = told;
      this.labels = null;
      this.layer = null;
      this.pen = null;
      this.done = null;
      this.cancel = null;
      this.target = null;
      this.now = null;
      this.queued = false;
      this.keys = (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this.end(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.end(false);
        }
      };
      const again = () => this.soon();
      window.addEventListener("scroll", again, true);
      window.addEventListener("resize", again);
    }
    /** The words on the buttons, or null: no in-place edits. */
    setLabels(l) {
      this.labels = l && l.edit ? l : null;
      if (!this.labels) {
        this.pencil(null);
        return;
      }
      if (this.pen) this.pen.textContent = this.labels.edit;
      if (this.done) this.done.textContent = this.labels.done;
      if (this.cancel) this.cancel.textContent = this.labels.cancel;
    }
    on() {
      return !!this.labels;
    }
    /** Can these be edited in place? The publisher's marked words. */
    static words(el) {
      return !!el && el.nodeType === 1 && !!(el.getAttribute("data-hb-text-id") || "").trim() && !el.closest("svg");
    }
    /** A memory doc's text block, with its own id. */
    static docBlock(el, root) {
      return !!el && el.nodeType === 1 && !!el.id && !!DOC_TEXT[el.tagName] && el !== root && root.contains(el);
    }
    owns(n) {
      return !!this.layer && !!n && this.layer.contains(n);
    }
    /** The element being edited, or null. */
    editing() {
      return this.now ? this.now.el : null;
    }
    /** Show "Endre" by these words (null: let it go, after a moment, so the
     *  pointer can get from the words to it). */
    pencil(el, coarse) {
      clearTimeout(this.hideT);
      if (!this.labels || this.now) el = null;
      if (!el) {
        if (!this.target) return;
        this.hideT = setTimeout(() => {
          this.target = null;
          gone(this.pen);
        }, 600);
        return;
      }
      this.target = el;
      const b = this.ensure().pen;
      b.style.height = (coarse ? 44 : 32) + "px";
      this.place();
    }
    /** The pointer is on our buttons: keep them. */
    keep() {
      clearTimeout(this.hideT);
    }
    /** The parent said go: edit these words, as `text` (a doc block's
     *  markdown) or as they are. */
    begin(el, text) {
      if (!this.labels) return;
      if (this.now) this.end(false);
      clearTimeout(this.hideT);
      this.target = null;
      gone(this.pen);
      const html = el.innerHTML, ce = el.getAttribute("contenteditable"), style3 = el.getAttribute("style");
      const md = typeof text === "string";
      let before;
      if (md) {
        el.textContent = before = text;
        el.style.whiteSpace = "pre-wrap";
      } else before = (el.textContent || "").replace(/\s+/g, " ").trim();
      this.now = { el, html, ce, style: style3, md, before };
      el.setAttribute("contenteditable", "plaintext-only");
      if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
      el.addEventListener("keydown", this.keys, true);
      el.focus();
      const s = window.getSelection(), r = document.createRange();
      r.selectNodeContents(el);
      if (s) {
        s.removeAllRanges();
        s.addRange(r);
      }
      this.ensure();
      this.place();
    }
    /** Ferdig (true) or Avbryt (false). */
    end(ok) {
      const n = this.now;
      if (!n) return;
      this.now = null;
      const after = n.md ? (n.el.innerText || n.el.textContent || "").replace(/\s+$/, "") : (n.el.textContent || "").replace(/\s+/g, " ").trim();
      n.el.removeEventListener("keydown", this.keys, true);
      if (n.ce === null) n.el.removeAttribute("contenteditable");
      else n.el.setAttribute("contenteditable", n.ce);
      if (n.style === null) n.el.removeAttribute("style");
      else n.el.setAttribute("style", n.style);
      n.el.innerHTML = n.html;
      n.el.blur();
      const s = window.getSelection();
      if (s) s.removeAllRanges();
      gone(this.done);
      gone(this.cancel);
      this.told(n.el, { before: n.before, after: ok ? after : null });
    }
    button(primary, act) {
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = style(primary, 44);
      b.addEventListener("touchstart", function(e) {
        e.preventDefault();
      }, { passive: false });
      b.addEventListener("mousedown", function(e) {
        e.preventDefault();
      });
      let fired = false;
      const go = function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (fired) return;
        fired = true;
        setTimeout(function() {
          fired = false;
        }, 400);
        act();
      };
      b.addEventListener("pointerup", go);
      b.addEventListener("click", go);
      b.addEventListener("pointerenter", () => this.keep());
      this.layer.appendChild(b);
      return b;
    }
    ensure() {
      if (!this.layer || !this.layer.isConnected) {
        this.layer = document.createElement("div");
        this.layer.setAttribute("data-huddle-review-edit", "1");
        this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483000";
        document.documentElement.appendChild(this.layer);
        this.pen = this.done = this.cancel = null;
      }
      const L = this.labels;
      if (!this.pen) {
        this.pen = this.button(false, () => {
          const t = this.target;
          if (t) this.ask(t);
        });
        this.pen.setAttribute("data-hb-edit", "pen");
        this.pen.textContent = L.edit;
      }
      if (!this.done) {
        this.done = this.button(true, () => this.end(true));
        this.done.setAttribute("data-hb-edit", "done");
        this.done.textContent = L.done;
        this.cancel = this.button(false, () => this.end(false));
        this.cancel.setAttribute("data-hb-edit", "cancel");
        this.cancel.textContent = L.cancel;
      }
      return { pen: this.pen };
    }
    // Above the words (on a phone the keyboard comes up from below), at their
    // right end; below them when there is no room above.
    at(el, w, h) {
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      let y = r.top - GAP2 - h;
      if (y < EDGE3) y = r.bottom + GAP2;
      const x = Math.max(EDGE3, Math.min(r.right - w, vw - w - EDGE3));
      return { x: x + window.pageXOffset, y: y + window.pageYOffset };
    }
    show(b, x, y) {
      clearTimeout(fading.get(b));
      b.style.opacity = "";
      b.style.left = x + "px";
      b.style.top = y + "px";
      b.style.display = "block";
    }
    place() {
      if (this.now && this.done && this.cancel) {
        const d = this.done, c = this.cancel;
        d.style.visibility = c.style.visibility = "hidden";
        d.style.display = c.style.display = "block";
        const w = d.offsetWidth + GAP2 + c.offsetWidth;
        const p = this.at(this.now.el, w, 44);
        d.style.visibility = c.style.visibility = "";
        this.show(c, p.x, p.y);
        this.show(d, p.x + c.offsetWidth + GAP2, p.y);
        return;
      }
      if (this.target && this.pen) {
        const b = this.pen;
        b.style.visibility = "hidden";
        b.style.display = "block";
        const p = this.at(this.target, b.offsetWidth, b.offsetHeight);
        b.style.visibility = "";
        this.show(b, p.x, p.y);
      }
    }
    soon() {
      if (this.queued || !this.now && !this.target) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        this.place();
      });
    }
  };

  // src/bridge/hold.ts
  var seg;
  function segmenter() {
    if (seg === void 0) {
      const I = globalThis.Intl;
      try {
        seg = I && I.Segmenter ? new I.Segmenter(void 0, { granularity: "word" }) : null;
      } catch (_) {
        seg = null;
      }
    }
    return seg;
  }
  function wordIn(text, off) {
    const S = segmenter();
    if (S) {
      for (const s of S.segment(text)) {
        if (off >= s.index && off < s.index + s.segment.length) return s.isWordLike ? [s.index, s.index + s.segment.length] : null;
      }
      return null;
    }
    const W = /[^\s.,;:!?«»"“”()\[\]{}<>\/\\|]/;
    if (!W.test(text.charAt(off))) return null;
    let a = off, b = off + 1;
    while (a > 0 && W.test(text.charAt(a - 1))) a--;
    while (b < text.length && W.test(text.charAt(b))) b++;
    return [a, b];
  }
  function caretAt(x, y) {
    const d = document;
    if (d.caretPositionFromPoint) {
      const p = d.caretPositionFromPoint(x, y);
      return p ? { node: p.offsetNode, off: p.offset } : null;
    }
    if (d.caretRangeFromPoint) {
      const r = d.caretRangeFromPoint(x, y);
      return r ? { node: r.startContainer, off: r.startOffset } : null;
    }
    return null;
  }
  function hits(r, x, y) {
    const rs = r.getClientRects();
    for (let i = 0; i < rs.length; i++) {
      const q = rs[i];
      if (x >= q.left - 1 && x <= q.right + 1 && y >= q.top - 1 && y <= q.bottom + 1) return true;
    }
    return false;
  }
  function wordAt(x, y) {
    const c = caretAt(x, y);
    if (!c || c.node.nodeType !== 3) return null;
    const text = c.node.nodeValue || "";
    for (const off of [c.off, c.off - 1]) {
      if (off < 0 || off >= text.length) continue;
      const w = wordIn(text, off);
      if (!w) continue;
      const r = document.createRange();
      r.setStart(c.node, w[0]);
      r.setEnd(c.node, w[1]);
      if (hits(r, x, y)) return r;
    }
    return null;
  }
  function stretch(first, now) {
    const r = document.createRange();
    if (now.compareBoundaryPoints(Range.START_TO_START, first) < 0) {
      r.setStart(now.startContainer, now.startOffset);
      r.setEnd(first.endContainer, first.endOffset);
    } else {
      r.setStart(first.startContainer, first.startOffset);
      r.setEnd(now.endContainer, now.endOffset);
    }
    return r;
  }
  var NAME2 = "hb-hold";
  var style2 = null;
  function showHeld(r) {
    const H2 = globalThis.Highlight;
    const reg = globalThis.CSS && CSS.highlights;
    if (!H2 || !reg) return;
    if (!r) {
      reg.delete(NAME2);
      return;
    }
    if (!style2 || !style2.isConnected) {
      style2 = document.createElement("style");
      style2.setAttribute("data-huddle-review", "1");
      style2.textContent = "::highlight(" + NAME2 + "){background-color:#FCDB45;color:#192029}";
      (document.head || document.documentElement).appendChild(style2);
    }
    reg.set(NAME2, new H2(r));
  }

  // src/bridge/outline.ts
  var ACCENT3 = "#1659B5";
  function list(t) {
    return !t ? [] : Array.isArray(t) ? t : [t];
  }
  function same(a, b) {
    return a.length > 0 && a.length === b.length && a.every((e, i) => e === b[i]);
  }
  var Outline = class {
    constructor() {
      this.layer = null;
      this.boxes = { hover: null, pick: null };
      this.els = { hover: [], pick: [] };
      this.queued = false;
      const again = () => this.soon();
      window.addEventListener("scroll", again, true);
      window.addEventListener("resize", again);
    }
    /** What a click or a tap would pick, or null to hide it. */
    hover(t) {
      const els = list(t);
      this.set("hover", same(els, this.els.pick) ? [] : els);
    }
    /** What was picked (replaces the old inline outline), or null. */
    pick(t) {
      const els = list(t);
      this.set("pick", els);
      if (same(els, this.els.hover)) this.set("hover", []);
    }
    set(kind, els) {
      this.els[kind] = els;
      if (!els.length) {
        if (this.boxes[kind]) this.boxes[kind].style.display = "none";
        return;
      }
      this.place(kind);
    }
    box(kind) {
      if (!this.layer || !this.layer.isConnected) {
        this.layer = document.createElement("div");
        this.layer.setAttribute("data-huddle-review-outline", "1");
        this.layer.setAttribute("aria-hidden", "true");
        this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147482999";
        document.documentElement.appendChild(this.layer);
        this.boxes = { hover: null, pick: null };
      }
      let b = this.boxes[kind];
      if (!b) {
        b = document.createElement("div");
        b.setAttribute("data-hb-outline", kind);
        const w = kind === "pick" ? 3 : 2;
        b.style.cssText = // Inline and whole: the page's own CSS for a <div> must not reach it.
        "position:absolute;display:none;box-sizing:border-box;margin:0;padding:0;background:none;pointer-events:none;border-radius:2px;border:" + w + "px " + (kind === "pick" ? "solid " : "dashed ") + ACCENT3;
        b.setAttribute("data-w", String(w));
        this.layer.appendChild(b);
        this.boxes[kind] = b;
      }
      return b;
    }
    place(kind) {
      const els = this.els[kind];
      if (!els.length) return;
      const b = this.box(kind);
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
      els.forEach(function(e) {
        const q = e.getBoundingClientRect();
        if (!q.width && !q.height) return;
        l = Math.min(l, q.left);
        t = Math.min(t, q.top);
        rr = Math.max(rr, q.right);
        bb = Math.max(bb, q.bottom);
      });
      if (l === Infinity) {
        b.style.display = "none";
        return;
      }
      const r = { left: l, top: t, width: rr - l, height: bb - t };
      const w = +(b.getAttribute("data-w") || 2);
      const pad = 3 + w;
      const sx = window.pageXOffset, sy = window.pageYOffset;
      b.style.left = r.left + sx - pad + "px";
      b.style.top = r.top + sy - pad + "px";
      b.style.width = r.width + 2 * pad + "px";
      b.style.height = r.height + 2 * pad + "px";
      b.style.display = "block";
    }
    soon() {
      if (this.queued) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        this.place("hover");
        this.place("pick");
      });
    }
  };

  // src/bridge/pins.ts
  var DONE = { addressed: 1, answered: 1, resolved: 1, wontdo: 1 };
  var Pins = class {
    constructor(A, send) {
      this.A = A;
      this.send = send;
      this.pins = [];
      this.nodes = [];
      this.layer = null;
      this.style = null;
      this.colors = { bg: "#1659B5", fg: "#FFFFFF", done: "#716669", doneFg: "#FFFFFF" };
      this.queued = false;
      this.ys = [];
      this.painted = [];
      this.on = null;
      const again = () => this.soon();
      window.addEventListener("scroll", () => this.report(), true);
      window.addEventListener("resize", again);
      if (typeof ResizeObserver === "function" && document.body) {
        try {
          new ResizeObserver(again).observe(document.body);
        } catch (_) {
        }
      }
    }
    /** Is this node one of ours (a marker), not the page's? */
    owns(n) {
      return !!this.layer && !!n && this.layer.contains(n);
    }
    set(pins, colors) {
      this.pins = Array.isArray(pins) ? pins : [];
      if (colors) this.colors = colors;
      this.render();
    }
    ensure() {
      if (this.layer && this.layer.isConnected) return this.layer;
      this.style = document.createElement("style");
      this.style.setAttribute("data-huddle-review", "1");
      (document.head || document.documentElement).appendChild(this.style);
      this.layer = document.createElement("div");
      this.layer.setAttribute("data-huddle-review-layer", "1");
      this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;z-index:2147483000";
      document.documentElement.appendChild(this.layer);
      return this.layer;
    }
    render() {
      const c = this.colors;
      const host = this.ensure();
      this.style.textContent = ".hb-pin{position:absolute;transform:translate(-50%,-50%);min-width:22px;height:22px;padding:0 6px;margin:0;border-radius:11px;border:0;box-sizing:border-box;font:700 12px/22px ui-sans-serif,system-ui,sans-serif;text-align:center;cursor:pointer;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.35);background:" + c.bg + ";color:" + c.fg + "}.hb-pin[data-done='1']{background:" + c.done + ";color:" + c.doneFg + "}.hb-pin[data-pulse='1']{outline:3px solid " + c.bg + ";outline-offset:3px}::highlight(hb-quote){background-color:rgba(252,219,69,.5)}::highlight(hb-quote-on){background-color:#FCDB45;color:#192029}@media print{.hb-pin{display:none}}";
      host.textContent = "";
      this.nodes = this.pins.map((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "hb-pin";
        b.setAttribute("data-id", p.id);
        b.setAttribute("aria-label", p.title || "#" + p.n);
        if (DONE[p.state]) b.setAttribute("data-done", "1");
        b.textContent = (p.who || "") + p.n;
        b.title = p.title || "";
        const stop = (ev) => {
          ev.stopPropagation();
        };
        b.addEventListener("pointerdown", stop, true);
        b.addEventListener("pointerup", stop, true);
        b.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.send({ type: "pin", id: p.id });
        });
        host.appendChild(b);
        return b;
      });
      this.place();
      this.paint();
    }
    /** The page's words were put back (an edit in place ended): paint and place again. */
    again() {
      this.place();
      this.paint();
    }
    /** Paint the words of every open thread that quotes some (no Highlight API: nothing). */
    paint() {
      this.painted = [];
      this.pins.forEach((p) => {
        if (!p.exact || DONE[p.state] || !p.block) return;
        const el = this.A.find(p.block);
        const r = el ? quoteRange(el, p.exact, p.prefix, p.suffix) : null;
        if (r) this.painted.push({ id: p.id, range: r });
      });
      this.highlight();
    }
    highlight() {
      const H2 = globalThis.Highlight;
      const reg = globalThis.CSS && CSS.highlights;
      if (!H2 || !reg) return;
      const all = this.painted.filter((x) => x.id !== this.on).map((x) => x.range);
      const on = this.painted.filter((x) => x.id === this.on).map((x) => x.range);
      if (all.length) reg.set("hb-quote", new H2(...all));
      else reg.delete("hb-quote");
      if (on.length) reg.set("hb-quote-on", new H2(...on));
      else reg.delete("hb-quote-on");
    }
    /** The open thread whose painted words are under this point (client px), or null. */
    paintedAt(x, y) {
      for (const p of this.painted) {
        const rs = p.range.getClientRects();
        for (let i = 0; i < rs.length; i++) {
          const q = rs[i];
          if (x >= q.left && x <= q.right && y >= q.top && y <= q.bottom) return p.id;
        }
      }
      return null;
    }
    /** The thread open in the list: its words brighter (null: none). */
    setOn(id) {
      this.on = id;
      this.highlight();
    }
    soon() {
      if (this.queued) return;
      this.queued = true;
      requestAnimationFrame(() => {
        this.queued = false;
        this.place();
      });
    }
    place() {
      if (!this.nodes.length && !this.ys.length) return;
      const size = docSize();
      const sx = window.pageXOffset, sy = window.pageYOffset;
      const used = {};
      const ys = [];
      this.pins.forEach((p, i) => {
        const node = this.nodes[i];
        let x = null, y = null, key = "";
        const el = p.block ? this.A.find(p.block) : null;
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width || r.height) {
            x = r.right + sx - 4;
            y = r.top + sy + 2;
            key = p.block;
          }
        }
        if (x === null && p.point) {
          x = p.point.x / 100 * size.w;
          y = p.point.y / 100 * size.h;
          key = "@" + Math.round(x) + "," + Math.round(y);
        }
        if (x === null || y === null) {
          node.hidden = true;
          return;
        }
        const k = used[key] || 0;
        used[key] = k + 1;
        x = Math.max(14, Math.min(size.w - 26, x - k * 26));
        node.hidden = false;
        node.style.left = x + "px";
        node.style.top = y + "px";
        ys.push({ id: p.id, y });
      });
      this.ys = ys;
      this.report();
    }
    /** Where the markers are and what is on screen, for the shell's strip. */
    report() {
      if (!this.pins.length && !this.ys.length) return;
      const sb = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      this.send({ type: "layout", top: window.pageYOffset, view: window.innerHeight, height: docSize().h, pins: this.ys, sb });
    }
    /** Bring one marker into view and make it pulse. */
    show(id) {
      const i = this.pins.findIndex((p) => p.id === id);
      const node = this.nodes[i];
      if (!node || node.hidden) return false;
      const y = parseFloat(node.style.top) || 0;
      window.scrollTo({ top: Math.max(0, y - window.innerHeight / 3), behavior: "smooth" });
      node.setAttribute("data-pulse", "1");
      setTimeout(() => node.removeAttribute("data-pulse"), 1400);
      return true;
    }
  };

  // src/nav.ts
  var NAME3 = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  function version(q) {
    if (!q) return null;
    const n = parseInt(String(q).replace(/^v/i, ""), 10);
    return n > 0 ? n : null;
  }
  function dec(s) {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  }
  function huddlePath(path, search) {
    const m = /^\/p\/[^/]+\/v\/([^/]+)\/([^/]+)(?:\/html)?\/?$/.exec(path);
    if (!m) return null;
    const o = dec(m[1]), s = dec(m[2]);
    if (!NAME3.test(o) || !NAME3.test(s)) return null;
    return { kind: "visual", o, s, v: version(new URLSearchParams(search).get("v")) };
  }
  function shelfPath(rest) {
    const m = /^\/?([^/]+)\/([^/]+)(?:\/v\/v?(\d+))?\/?$/.exec(rest);
    if (!m) return null;
    const o = dec(m[1]), s = dec(m[2]);
    if (!NAME3.test(o) || !NAME3.test(s)) return null;
    return { kind: "visual", o, s, v: m[3] ? version(m[3]) : null };
  }
  function resolveHref(raw, c) {
    const href = String(raw == null ? "" : raw).trim();
    if (href === "" || href.charAt(0) === "#") return { kind: "fragment", id: dec(href.slice(1)) };
    if (/^(mailto|tel|sms|javascript|data|blob|about):/i.test(href)) return { kind: "pass" };
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.slice(0, 2) === "//" || href.charAt(0) === "/") {
      let u;
      try {
        u = new URL(href, c.origin + "/");
      } catch (_) {
        return { kind: "none" };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") return { kind: "pass" };
      if (c.shelf) {
        let base = null;
        try {
          base = new URL(c.shelf);
        } catch (_) {
          base = null;
        }
        if (base && u.origin === base.origin) {
          const root = base.pathname.replace(/\/+$/, "");
          if (u.pathname === root || u.pathname.indexOf(root + "/") === 0) {
            const d = shelfPath(u.pathname.slice(root.length));
            if (d) return d;
          }
        }
      }
      if (u.origin === c.origin) return huddlePath(u.pathname, u.search) || { kind: "page", url: u.pathname + u.search + u.hash };
      return { kind: "away", url: u.href };
    }
    const q = href.indexOf("?"), h = href.indexOf("#");
    const end = Math.min(q < 0 ? href.length : q, h < 0 ? href.length : h);
    let path = href.slice(0, end);
    const search = q >= 0 ? href.slice(q, h > q ? h : href.length) : "";
    path = path.replace(/^(\.\.?\/)+/, "").replace(/\/+$/, "").replace(/\.html?$/i, "");
    const s = dec(path);
    if (!NAME3.test(s) || !c.owner) return { kind: "none" };
    return { kind: "visual", o: c.owner, s, v: version(new URLSearchParams(search).get("v")) };
  }
  function viewerUrl(viewer, d) {
    const E = encodeURIComponent;
    return viewer.replace(/\/?$/, "/") + E(d.o) + "/" + E(d.s) + (d.v ? "?v=" + d.v : "");
  }

  // src/bridge/index.ts
  (function() {
    if (window.__huddleReviewBridge) return;
    const framed = window.parent !== window;
    const ROOT = framed ? document.body : document.getElementById("hb-doc");
    if (!ROOT) return;
    window.__huddleReviewBridge = true;
    const A = new Anchors(ROOT, framed);
    const P = new Pins(A, send);
    const O = new Outline();
    const C = new Chip(function() {
      const r = C.words();
      C.hide();
      const m = r ? selectionOf(r) : null;
      const s = window.getSelection();
      if (s) s.removeAllRanges();
      if (!m) return;
      m.chip = true;
      send(m);
    });
    let finger = false;
    function nameOf(el) {
      const id = A.idOf(el);
      return id && id.indexOf("~") < 0 ? id : null;
    }
    const D = framed ? new Data(ROOT, nameOf) : null;
    const DF = framed ? new Diff(ROOT) : null;
    const E = new Editor(
      function(el) {
        send({ type: "edit", block: A.idOf(el) || "" });
      },
      function(el, d) {
        P.again();
        const block = A.idOf(el) || "";
        if (d.after === null) return send({ type: "edited", block, before: d.before, after: null, cancelled: true });
        const quote = flat(el.textContent).trim().slice(0, 120) || null;
        send({ type: "edited", block, before: d.before, after: d.after, path: A.pathOf(el), quote });
      }
    );
    function canEdit(el) {
      return framed ? Editor.words(el) : Editor.docBlock(el, ROOT);
    }
    const srcdoc = framed && location.href === "about:srcdoc";
    const PASS = "a,button,input,select,textarea,summary,label,[contenteditable],[role=button]";
    let mode = "always";
    let picking = false;
    let swallowClick = false;
    let hoverOn = true;
    const EARS = [];
    function ear(t, type, fn, capture) {
      EARS.push([t, type, fn, capture]);
      t.addEventListener(type, fn, capture);
    }
    const SEL = [];
    function earSel(t, type, fn, capture) {
      SEL.push([t, type, fn, capture]);
      t.addEventListener(type, fn, capture);
    }
    function send(msg) {
      Object.assign(msg, { hb: 1, up: 1 });
      if (framed) window.parent.postMessage(msg, "*");
      else window.postMessage(msg, location.origin);
    }
    let current = null;
    function figureLabel(fig) {
      const own2 = fig.getAttribute("data-hb-label") || fig.getAttribute("aria-label");
      const cap = fig.querySelector("figcaption");
      return flat(own2 || (cap ? cap.textContent : "")).trim().slice(0, 80) || nameOf(fig);
    }
    function datumPick(target2) {
      const h = D && tappable(target2) ? D.at(target2) : null;
      return h ? { el: h.fig, els: [h.mark], part: true, label: figureLabel(h.fig), datum: h.datum } : null;
    }
    function mark(p) {
      current = p;
      O.pick(p ? p.els : null);
      E.pencil(p && canEdit(p.el) ? p.el : null, !FINE);
    }
    function selected() {
      const sel = window.getSelection();
      return !!(sel && !sel.isCollapsed && flat(sel.toString()).trim());
    }
    let pickStyle = false;
    function setPicking(on) {
      picking = on;
      if (on && !pickStyle) {
        pickStyle = true;
        const s = document.createElement("style");
        s.setAttribute("data-huddle-review", "1");
        s.textContent = ".hb-picking,.hb-picking *{cursor:crosshair !important}";
        (document.head || document.documentElement).appendChild(s);
      }
      document.documentElement.classList.toggle("hb-picking", on);
    }
    function tappable(target2) {
      if (!A.inside(target2) || P.owns(target2) || DF && DF.owns(target2)) return false;
      if (E.editing()) return false;
      if (mode === "picking") return picking;
      return !(target2.closest && target2.closest(PASS));
    }
    function within(p, target2, x, y) {
      if (p.els.some(function(e) {
        return e === target2 || e.contains(target2);
      })) return true;
      if (target2 !== ROOT) return false;
      const a = p.els[0].getBoundingClientRect(), b = p.els[p.els.length - 1].getBoundingClientRect();
      return y >= a.top && y <= b.bottom;
    }
    function pickFor(target2, x, y) {
      if (current && within(current, target2, x, y)) {
        if (current.datum) return { el: current.el, els: [current.el], part: true, box: true, label: current.label };
        return A.up(current) || "page";
      }
      return datumPick(target2) || A.pick(target2, x, y);
    }
    function tapMsg(p, target2, pageX, pageY) {
      const words2 = !!p && E.on() && canEdit(p.el);
      const el = p ? p.el : null;
      const block = el ? A.idOf(el) : null;
      const m = {
        type: "tap",
        block,
        exact: null,
        path: el ? A.pathOf(el) : null,
        text: p ? p.els.map(textOf).join("\n").slice(0, 300) : null
      };
      if (p && p.part) {
        m.level = "part";
        m.label = p.label;
      } else if (p && p.box) m.level = "box";
      if (words2) m.words = true;
      if (block) m.quote = clip(A.labelOf(target2, el), 120) || null;
      if (el && el.hasAttribute("data-hb-visual")) m.quote = m.text = figureLabel(el);
      if (p && p.datum) {
        m.datum = p.datum;
        m.quote = null;
      }
      m.point = pointAt(pageX, pageY);
      m.selector = selectorFor(target2);
      return m;
    }
    function tap(target2, pageX, pageY) {
      O.hover(null);
      if (!tappable(target2)) return;
      if (mode === "picking") setPicking(false);
      if (selected()) return;
      const painted = P.paintedAt(pageX - window.pageXOffset, pageY - window.pageYOffset);
      if (painted) {
        P.setOn(painted);
        return send({ type: "pin", id: painted });
      }
      const c = pickFor(target2, pageX - window.pageXOffset, pageY - window.pageYOffset);
      showHeld(null);
      if (c === "page") {
        mark(null);
        return send({ type: "tap", block: null, exact: null, path: null, text: null, level: "page", point: pointAt(pageX, pageY) });
      }
      mark(c);
      send(tapMsg(c, target2, pageX, pageY));
    }
    const MOVE = 10, LONG = 600, WAIT = 250, HOLD = 500;
    let down = null;
    function stamp(e) {
      const t = e.timeStamp;
      return t > 0 && t < 1e11 ? t : performance.now();
    }
    let pending;
    let holdT;
    let held = null;
    ear(
      document,
      "pointerdown",
      function(e) {
        clearTimeout(pending);
        clearTimeout(holdT);
        if (C.owns(e.target)) return;
        down = e.isPrimary && (e.pointerType !== "mouse" || e.button === 0) ? { x: e.clientX, y: e.clientY, t: stamp(e), target: e.target, mouse: e.pointerType === "mouse" } : null;
        if (down && e.pointerType !== "mouse") hoverAt(down.target, e.clientX, e.clientY);
        if (down && tappable(down.target)) holdT = setTimeout(onHold, HOLD);
      },
      true
    );
    ear(document, "pointercancel", function(e) {
      clearTimeout(holdT);
      const d = down;
      down = null;
      O.hover(null);
      if (d && d.hold && d.msg && stamp(e) - d.t >= HOLD) send(d.msg);
    }, true);
    function onHold() {
      const d = down;
      if (!d || selected()) return;
      d.hold = true;
      d.prev = current;
      const dp = datumPick(d.target);
      if (dp) {
        O.hover(null);
        mark(dp);
        d.msg = tapMsg(dp, d.target, d.x + window.pageXOffset, d.y + window.pageYOffset);
        return;
      }
      const w = wordAt(d.x, d.y);
      if (w) {
        if (!d.mouse) return;
        held = { first: w, now: w };
        const s = window.getSelection();
        if (s) s.removeAllRanges();
        holding(true);
        O.hover(null);
        showHeld(w);
        return;
      }
      const b = A.boxAt(d.target, d.y);
      O.hover(null);
      if (!b) {
        d.hold = false;
        return;
      }
      showHeld(null);
      mark(b);
      d.msg = tapMsg(b, d.target, d.x + window.pageXOffset, d.y + window.pageYOffset);
    }
    let holdStyle = false;
    function holding(on) {
      if (on && !holdStyle) {
        holdStyle = true;
        const s = document.createElement("style");
        s.setAttribute("data-huddle-review", "1");
        s.textContent = ".hb-holding,.hb-holding *{-webkit-user-select:none !important;user-select:none !important}";
        (document.head || document.documentElement).appendChild(s);
      }
      document.documentElement.classList.toggle("hb-holding", on);
    }
    ear(
      document,
      "pointerup",
      function(e) {
        clearTimeout(holdT);
        const d = down;
        down = null;
        const up = stamp(e);
        const quick = !!d && up - d.t < HOLD;
        if (d && d.hold && quick) {
          d.hold = false;
          d.msg = void 0;
          if (held) {
            held = null;
            holding(false);
          }
          showHeld(null);
          mark(d.prev || null);
        }
        if (d && d.msg) {
          if (mode === "picking") setPicking(false);
          return send(d.msg);
        }
        if (held) {
          const r = held.now;
          held = null;
          holding(false);
          mark(null);
          const m = selectionOf(r);
          if (m) {
            m.held = true;
            send(m);
          }
          return;
        }
        if (e.pointerType !== "mouse") O.hover(null);
        if (!d || !e.isPrimary || d.hold) return;
        if (Math.abs(e.clientX - d.x) > MOVE || Math.abs(e.clientY - d.y) > MOVE) return;
        if (up - d.t > LONG) return;
        if (picking) {
          swallowClick = true;
          setTimeout(function() {
            swallowClick = false;
          }, 0);
        }
        const px = d.x + window.pageXOffset, py = d.y + window.pageYOffset;
        pending = setTimeout(function() {
          tap(d.target, px, py);
        }, WAIT);
      },
      true
    );
    function hoverAt(target2, x, y) {
      if (target2 && E.owns(target2)) return E.keep();
      const p = hoverOn && target2 && tappable(target2) && !selected() && !P.paintedAt(x, y) ? pickFor(target2, x, y) : null;
      O.hover(p && p !== "page" ? p.els : null);
      if (FINE && !E.editing()) {
        const w = p && p !== "page" && Editor.words(p.el) ? p.el : current && canEdit(current.el) ? current.el : null;
        E.pencil(w);
      }
    }
    const FINE = typeof window.matchMedia !== "function" || matchMedia("(hover: hover)").matches;
    let under = null;
    let ux = 0, uy = 0;
    let looking = false;
    ear(
      document,
      "pointermove",
      function(e) {
        const moved = !!down && (Math.abs(e.clientX - down.x) > MOVE || Math.abs(e.clientY - down.y) > MOVE);
        if (moved) clearTimeout(holdT);
        if (held) {
          const w = wordAt(e.clientX, e.clientY);
          if (w) {
            held.now = stretch(held.first, w);
            showHeld(held.now);
          }
          return;
        }
        if (e.pointerType !== "mouse") {
          if (moved) O.hover(null);
          return;
        }
        if (!FINE) return;
        under = e.buttons ? null : e.target;
        ux = e.clientX;
        uy = e.clientY;
        if (looking) return;
        looking = true;
        requestAnimationFrame(function() {
          looking = false;
          hoverAt(under, ux, uy);
        });
      },
      true
    );
    ear(document, "mouseout", function(e) {
      if (!e.relatedTarget) {
        under = null;
        O.hover(null);
      }
    }, true);
    let timer;
    let pressed = false;
    earSel(document, "pointerdown", function(e) {
      if (C.owns(e.target)) return;
      finger = e.pointerType !== "mouse";
      pressed = !finger;
    }, true);
    earSel(document, "selectionchange", function() {
      clearTimeout(timer);
      C.hide();
      timer = setTimeout(function() {
        if (E.editing()) return;
        const sel = window.getSelection();
        const exact = sel && !sel.isCollapsed ? flat(sel.toString()).trim() : "";
        if (exact) O.hover(null);
        if (held) return;
        if (!exact || !A.inside(sel.getRangeAt(0).commonAncestorContainer)) return send({ type: "selection", exact: null });
        const r = sel.getRangeAt(0);
        if (finger) C.show(r);
        else if (!commenting && !pressed) C.show(r, true);
        send(selectionOf(r));
      }, 150);
    }, false);
    earSel(document, "pointerup", function(e) {
      if (e.pointerType !== "mouse" || !e.isPrimary || e.button !== 0) return;
      pressed = false;
      if (C.owns(e.target)) return;
      if (held || E.editing()) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      if (!A.inside(r.commonAncestorContainer)) return;
      const m = selectionOf(r);
      if (!m) return;
      if (!commenting) C.show(r, true);
      m.released = true;
      send(m);
    }, true);
    function selectionOf(range) {
      const exact = flat(range.toString()).trim();
      if (!exact) return null;
      const el = A.blockOf(range.commonAncestorContainer);
      const whole = el ? flat(plain(el)) : "";
      let at = whole.indexOf(exact);
      if (el && at >= 0 && whole.indexOf(exact, at + 1) >= 0) {
        const near = flatOffset(el, range);
        for (let i = at; i >= 0; i = whole.indexOf(exact, i + 1)) if (Math.abs(i - near) < Math.abs(at - near)) at = i;
      }
      const r = range.getBoundingClientRect();
      return {
        type: "selection",
        block: el ? A.idOf(el) : null,
        exact: exact.slice(0, 1e3),
        prefix: at > 0 ? whole.slice(Math.max(0, at - 32), at) : "",
        suffix: at >= 0 ? whole.slice(at + exact.length, at + exact.length + 32) : "",
        path: el ? A.pathOf(el) : null,
        // The start of the passage, where reading starts.
        point: pointAt(r.left + window.pageXOffset + Math.min(r.width, 10), r.top + window.pageYOffset + r.height / 2)
      };
    }
    let NAV = null;
    const openWindow = window.open;
    function target(el) {
      return (el.getAttribute("target") || "").toLowerCase();
    }
    function hrefOf(a) {
      const h = a.getAttribute("href");
      return h !== null ? h : a.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
    function byId(id) {
      try {
        return document.getElementById(id) || document.getElementsByName(id)[0] || null;
      } catch (_) {
        return null;
      }
    }
    function newTab(url, href) {
      try {
        openWindow.call(window, url, "_blank", "noopener");
      } catch (_) {
        send({ type: "link", href, action: "blocked" });
      }
    }
    function links(ev, a, href, tab) {
      const d = NAV ? resolveHref(href, NAV) : null;
      if (href === "" || href.charAt(0) === "#") {
        const id = href.slice(1);
        const el = id ? byId(id) : null;
        if (srcdoc) {
          ev.preventDefault();
          if (el && el.scrollIntoView) el.scrollIntoView();
        }
        if (id && !el) send({ type: "link", href, action: "missing-anchor" });
        return;
      }
      if (!d) {
        if (!srcdoc) return;
        ev.preventDefault();
        if (/^(https?|mailto|tel):/i.test(href)) newTab(href, href);
        else send({ type: "link", href, action: "unresolvable" });
        return;
      }
      if (d.kind === "pass") {
        if (srcdoc && /^(mailto|tel):/i.test(href)) {
          ev.preventDefault();
          newTab(href, href);
        }
        return;
      }
      ev.preventDefault();
      if (d.kind === "away") return newTab(d.url, href);
      if (d.kind === "none") return send({ type: "link", href, action: "unresolvable" });
      if (d.kind === "fragment") return;
      if (tab) return newTab(NAV.origin + (d.kind === "visual" ? viewerUrl(NAV.viewer, d) : d.url), href);
      send({ type: "nav", href, y: Math.round(window.pageYOffset || 0) });
    }
    function follow(ev, middle) {
      if (ev.defaultPrevented) return;
      let a = ev.target;
      while (a && a !== document) {
        const n = String(a.nodeName).toLowerCase();
        if ((n === "a" || n === "area") && a.getAttribute && hrefOf(a) !== null) break;
        a = a.parentNode;
      }
      if (!a || a === document) return;
      const el = a;
      if (el.hasAttribute("download")) return;
      const t = target(el);
      const tab = middle || ev.ctrlKey || ev.metaKey || ev.shiftKey || t !== "" && t !== "_self" && t !== "_top" && t !== "_parent";
      if (middle && !NAV) return;
      links(ev, el, String(hrefOf(el)), tab);
    }
    if (framed) {
      window.addEventListener("pagehide", function() {
        send({ type: "leaving", y: Math.round(window.pageYOffset || 0) });
      });
      window.addEventListener("click", function(ev) {
        follow(ev, false);
      }, false);
      window.addEventListener("auxclick", function(ev) {
        if (ev.button === 1) follow(ev, true);
      }, false);
    }
    function wrapOpen() {
      window.open = function(url, name, features) {
        const href = url == null ? "" : String(url);
        if (NAV && href) {
          const d = resolveHref(href, NAV);
          const t = String(name || "_blank").toLowerCase();
          const self = t === "_self" || t === "_top" || t === "_parent";
          if (d.kind === "visual" || d.kind === "page") {
            if (self) {
              send({ type: "nav", href, y: Math.round(window.pageYOffset || 0) });
              return null;
            }
            return openWindow.call(window, NAV.origin + (d.kind === "visual" ? viewerUrl(NAV.viewer, d) : d.url), name, features);
          }
          if (d.kind === "none" && self) {
            send({ type: "link", href, action: "unresolvable" });
            return null;
          }
        }
        return openWindow.apply(window, arguments);
      };
    }
    ear(document, "click", function(ev) {
      if (picking || swallowClick) {
        swallowClick = false;
        ev.preventDefault();
        ev.stopPropagation();
      }
    }, true);
    ear(document, "keydown", function(ev) {
      if (picking && ev.key === "Escape") {
        setPicking(false);
        O.hover(null);
      }
    }, true);
    let commenting = true;
    let keepSelect = false;
    let selOn = true;
    function syncSel() {
      const want = commenting || keepSelect;
      if (want === selOn) return;
      selOn = want;
      SEL.forEach(function(x) {
        if (want) x[0].addEventListener(x[1], x[2], x[3]);
        else x[0].removeEventListener(x[1], x[2], x[3]);
      });
      if (!want) {
        clearTimeout(timer);
        C.hide();
        pressed = false;
      }
    }
    function setCommenting(on, select) {
      keepSelect = select;
      syncSel();
      if (on === commenting) return;
      commenting = on;
      EARS.forEach(function(x) {
        if (on) x[0].addEventListener(x[1], x[2], x[3]);
        else x[0].removeEventListener(x[1], x[2], x[3]);
      });
      syncSel();
      if (on) return;
      clearTimeout(pending);
      clearTimeout(holdT);
      clearTimeout(timer);
      down = null;
      under = null;
      swallowClick = false;
      if (held) {
        held = null;
        holding(false);
      }
      if (E.editing()) E.end(false);
      showHeld(null);
      mark(null);
      O.hover(null);
      C.hide();
      setPicking(false);
    }
    window.addEventListener("message", function(e) {
      if (e.source !== window.parent) return;
      if (!framed && e.origin !== location.origin) return;
      const m = e.data;
      if (!m || m.hb !== 1 || m.up) return;
      if (m.type === "hello") {
        if (m.tap === "picking" || m.tap === "always") mode = m.tap;
        hoverOn = m.hover !== false;
        E.setLabels(m.edit || null);
        if (!hoverOn) O.hover(null);
        C.setLabel(m.chip || "");
        C.setStyle(m.chipStyle || null);
        if (m.commenting !== void 0 || m.select !== void 0) setCommenting(m.commenting === void 0 ? commenting : m.commenting !== false, !!m.select);
        if (framed && m.nav && !NAV) wrapOpen();
        if (framed && m.nav) NAV = { origin: String(m.nav.origin), shelf: m.nav.shelf || null, viewer: String(m.nav.viewer), owner: String(m.nav.owner || "") };
        send({ type: "ready" });
        if (D) send({ type: "visuals", visuals: D.visuals(figureLabel) });
      } else if (m.type === "check") {
        send({
          type: "checked",
          results: (m.anchors || []).map(function(a) {
            return { id: a.id, status: A.check(a) };
          })
        });
      } else if (m.type === "show") {
        const ms = D && m.datum && m.block ? D.marks(m.block, m.datum) : [];
        if (ms.length) {
          current = null;
          O.pick(ms);
          if (m.id) P.setOn(m.id);
          ms[0].scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
        const el = A.find(m.block);
        current = null;
        O.pick(el);
        if (m.id) P.setOn(m.id);
        if (m.id && P.show(m.id)) return;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
        else if (m.point) {
          const s = document.documentElement.scrollHeight;
          window.scrollTo({ top: Math.max(0, m.point.y / 100 * s - window.innerHeight / 2), behavior: "smooth" });
        }
      } else if (m.type === "clear") {
        mark(null);
        showHeld(null);
        C.hide();
        P.setOn(null);
      } else if (m.type === "on") {
        P.setOn(m.id || null);
      } else if (m.type === "text") {
        const b = A.find(m.block);
        send({ type: "blocktext", block: m.block, text: b ? textOf(b).slice(0, 4e3) : null });
      } else if (m.type === "source") {
        send({ type: "source", block: m.block, name: m.name, rows: D ? D.rows(m.block, m.name) : null });
      } else if (m.type === "pins") {
        P.set(m.pins, m.colors);
      } else if (m.type === "commenting") {
        setCommenting(m.on !== false, !!m.select);
      } else if (m.type === "mode") {
        setPicking(!!m.picking && mode === "picking" && commenting);
      } else if (m.type === "diff") {
        const ch = DF ? DF.show(String(m.old || ""), String(m.now || ""), m.labels) : null;
        P.again();
        send({ type: "diffed", changes: ch });
      } else if (m.type === "diff-off") {
        if (DF && DF.active()) {
          DF.clear();
          P.again();
        }
      } else if (m.type === "diff-go") {
        if (DF) DF.go(+m.i);
      } else if (m.type === "ping") {
        send({ type: "pong" });
      } else if (m.type === "scroll") {
        const y = +m.y || 0;
        const go = function() {
          window.scrollTo(0, y);
        };
        if (document.readyState === "complete") go();
        else window.addEventListener("load", go, { once: true });
      } else if (m.type === "edit") {
        const el = A.find(m.block);
        if (commenting && el && canEdit(el)) {
          if (DF && DF.active()) {
            DF.clear();
            P.again();
            send({ type: "diffed", changes: null });
          }
          mark(null);
          O.hover(null);
          E.begin(el, m.text);
        }
      }
    });
    send({ type: "ready" });
  })();
})();
