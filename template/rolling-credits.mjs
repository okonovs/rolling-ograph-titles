// Rolling Credits v2 — OGraf graphic (EBU OGraf v1) for DaVinci Resolve 21
// Moves an exact whole number of OUTPUT pixels every frame, so the roll never
// lands on sub-pixel positions (no shimmer, no uneven steps).
//
// Text markup (one credit line per line):
//   # Title                big title (Title style)
//   ## Section             section header (Section style)
//   Role | Name            two columns meeting at the split line
//    | Name                continue the right column
//   any other text         centred line (Centred style)
//   (empty line)           "empty line gap"
//   [space 120]            exact gap in px (at 1080p)
//   ---                    long gap (% of screen height)
//   **bold**  *italic*     inline styling anywhere

const REF_HEIGHT = 1080;
const DEFAULTS = {
  "credits": "# NORTHERN LIGHTS\n\n## Musicians\nVocals | Anna Example\nVocals | Mark Sample\nSaxophone | Peter Placeholder\nPiano | Laura Lorem\nGuitar | Oliver Ipsum\nBass | Robert Dolor\nDrums | Victor Amet\nPercussion | Andrew Consectetur\n\nDancers | Rita Adipiscing\n | Nick Elit\n\nStage Design & Lighting | Paul Tempor\nVisuals | Vlad Incididunt\n | Eddie Labore\nMake-up | Julia Magna\n\nTechnical Director | Ray Aliqua\nProduction Manager | Agnes Veniam\nSound Engineer | Eric Nostrud\nPyrotechnics | Casper Ullamco\n\nCamera Director | Karl Laboris\nDirector of Photography | Alex Nisi\nCamera Operators | John Aliquip\n | Ed Commodo\n | Edgar Consequat\n | Roland Duis\n | Michael Aute\n | Chris Irure\n\nBroadcast Sound | Glen Reprehenderit\n | Martin Voluptate\n\nEditors | Karl Laboris\n | Alex Nisi\n\n---\n\n## Special thanks\nEva Velit\nLiv Esse\nIda Cillum\nAl Fugiat\nNorm Nulla\nRenee Pariatur\n\n## Supported by\nExample Radio\nSample News\nPlaceholder FM",
  "pixelsPerFrame": 3,
  "frameRate": 25,
  "endMode": "Roll out of frame",
  "showInfo": false,
  "font": "Helvetica Neue",
  "fontCustom": "",
  "nameFont": "Main font",
  "nameSize": 34,
  "nameWeight": "400 Regular",
  "nameItalic": false,
  "nameColor": "#F2F2F2",
  "roleFont": "Main font",
  "roleSize": 20,
  "roleWeight": "400 Regular",
  "roleTracking": 140,
  "roleUpper": true,
  "roleColor": "#9E9E9E",
  "sectionSize": 20,
  "sectionWeight": "600 Semibold",
  "sectionTracking": 320,
  "sectionSpaceBefore": 64,
  "sectionSpaceAfter": 30,
  "sectionColor": "#FFFFFF",
  "titleSize": 88,
  "titleWeight": "300 Light",
  "titleTracking": 250,
  "titleSpaceAfter": 72,
  "columnGap": 56,
  "lineSpacing": 1.42,
  "emptyLineGap": 56
};

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function weightNum(v, fallback = 400) {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

export default class RollingCredits extends HTMLElement {
  constructor() {
    super();
    this.data = { ...DEFAULTS };
    this.schedule = null;
    this.raf = null;
    this.visible = true;
    this.layout = null;
  }

  // ---------- OGraf API ----------
  async load(params = {}) {
    this.renderType = params.renderType || "realtime";
    this.data = { ...DEFAULTS, ...(params.data || {}) };
    this._build();
    this._render(0);
    return { statusCode: 200, result: this._info() };
  }

  async dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.innerHTML = "";
    return { statusCode: 200 };
  }

  async updateAction(params = {}) {
    this.data = { ...this.data, ...(params.data || {}) };
    this._build();
    this._render(this._lastFrame || 0);
    return { statusCode: 200, result: this._info() };
  }

  async playAction() {
    this.visible = true;
    if (this.renderType === "realtime") {
      if (this.raf) cancelAnimationFrame(this.raf);
      const start = performance.now();
      const tick = (now) => {
        this._render(Math.floor(((now - start) / 1000) * this._fps()));
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    }
    return { statusCode: 200, currentStep: undefined };
  }

  async stopAction() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.visible = false;
    if (this.root) this.root.style.visibility = "hidden";
    return { statusCode: 200 };
  }

  async customAction() {
    return { statusCode: 400, statusMessage: "No custom actions" };
  }

  async goToTime({ timestamp }) {
    let playTs = 0;
    let visible = true;
    if (Array.isArray(this.schedule) && this.schedule.length) {
      playTs = null;
      const sorted = [...this.schedule].sort((a, b) => a.timestamp - b.timestamp);
      for (const e of sorted) {
        if (e.timestamp > timestamp) break;
        const t = e.action && e.action.type;
        if (t === "playAction") { playTs = e.timestamp; visible = true; }
        else if (t === "stopAction") { visible = false; }
        else if (t === "updateAction" && e.action.params && e.action.params.data) {
          this.data = { ...this.data, ...e.action.params.data };
          this._build();
        }
      }
      if (playTs === null) playTs = 0;
    }
    this.visible = visible;
    this._render(Math.round(((timestamp - playTs) / 1000) * this._fps()));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { statusCode: 200 };
  }

  async setActionsSchedule({ schedule }) {
    this.schedule = schedule || [];
    return { statusCode: 200 };
  }

  // ---------- internals ----------
  _fps() {
    const f = Number(this.data.frameRate);
    return f > 0 ? f : 25;
  }

  _ppf() {
    return Math.max(1, Math.round(Number(this.data.pixelsPerFrame) || 1));
  }

  _n(key, min, max) {
    const v = Number(this.data[key]);
    const def = Number(DEFAULTS[key]);
    const x = Number.isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, x));
  }

  _family(sel) {
    const d = this.data;
    const main = String(d.fontCustom || "").trim() || String(d.font || "Helvetica Neue");
    const pick = !sel || sel === "Main font" ? main : sel;
    const first = pick === "System UI" ? "system-ui" : `"${pick.replace(/"/g, "")}"`;
    return { name: pick, css: `${first}, "Helvetica Neue", Helvetica, Arial, sans-serif` };
  }

  // o: {font, weight, size, lh (x size), tracking (1/1000 em), upper, italic, color}
  _style(o, k) {
    const size = Math.max(1, Math.round(o.size * k));
    const lh = Math.max(1, Math.round(size * o.lh));
    const fam = this._family(o.font);
    const w = weightNum(o.weight);
    const trackEm = (o.tracking || 0) / 1000;
    const css =
      `font-family:${fam.css};font-size:${size / this._dpr}px;font-weight:${w};` +
      `font-style:${o.italic ? "italic" : "normal"};letter-spacing:${trackEm}em;color:${o.color};` +
      (o.upper ? "text-transform:uppercase;" : "");
    return { size, lh, css, fam, trackEm, bold: Math.min(900, Math.max(600, w + 200)) };
  }

  _inline(s, st) {
    const bw = st ? st.bold : 700;
    let h = escapeHtml(s);
    h = h.replace(/\*\*(.+?)\*\*/g, `<b style="font-weight:${bw}">$1</b>`);
    h = h.replace(/(^|[^*])\*([^*]+?)\*/g, "$1<i>$2</i>");
    return h;
  }

  _fontMissing(name) {
    if (name === "System UI") return false;
    try {
      const c = (this._cv ||= document.createElement("canvas")).getContext("2d");
      const probe = "AaBbWwMmIil1ŠķĒņ0@";
      return ["monospace", "serif"].every((fb) => {
        c.font = `72px ${fb}`; const a = c.measureText(probe).width;
        c.font = `72px "${name}", ${fb}`; const b = c.measureText(probe).width;
        return a === b;
      });
    } catch { return false; }
  }

  _build() {
    const d = this.data;
    const dpr = (this._dpr = window.devicePixelRatio || 1);
    const W = Math.round((this.clientWidth || window.innerWidth) * dpr);
    const H = Math.round((this.clientHeight || window.innerHeight) * dpr);
    const k = H / REF_HEIGHT;
    const px = (v) => `${v / dpr}px`;

    const ls = this._n("lineSpacing", 0.8, 3);
    const S = {
      title: this._style({ font: "Main font", weight: d.titleWeight, size: this._n("titleSize", 8, 400), lh: 1.2,
        tracking: this._n("titleTracking", -100, 1000), color: d.nameColor }, k),
      section: this._style({ font: "Main font", weight: d.sectionWeight, size: this._n("sectionSize", 8, 200), lh: 1.4,
        tracking: this._n("sectionTracking", -100, 1000), upper: true, color: d.sectionColor }, k),
      role: this._style({ font: d.roleFont, weight: d.roleWeight, size: this._n("roleSize", 8, 200), lh: ls,
        tracking: this._n("roleTracking", -100, 1000), upper: !!d.roleUpper, color: d.roleColor }, k),
      name: this._style({ font: d.nameFont, weight: d.nameWeight, size: this._n("nameSize", 8, 200), lh: ls,
        tracking: 10, italic: !!d.nameItalic, color: d.nameColor }, k),
    };
    S.title.before = 0;
    S.title.after = Math.round(this._n("titleSpaceAfter", 0, 600) * k);
    S.section.before = Math.round(this._n("sectionSpaceBefore", 0, 600) * k);
    S.section.after = Math.round(this._n("sectionSpaceAfter", 0, 600) * k);
    S.centre = S.name;
    const rowH = Math.max(S.role.lh, S.name.lh);
    const split = Math.round(W / 2);
    const halfGap = Math.round((this._n("columnGap", 0, 800) * k) / 2);
    const emptyGap = Math.round(this._n("emptyLineGap", 0, 400) * k);
    const longGap = Math.round(H / 2);

    this.innerHTML = "";
    this.style.cssText =
      "position:absolute;inset:0;overflow:hidden;display:block;" +
      "background:transparent;";

    const root = document.createElement("div");
    root.style.cssText =
      `position:absolute;left:0;top:0;width:${px(W)};will-change:transform;` +
      "-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;" +
      "font-kerning:normal;white-space:nowrap;";
    this.appendChild(root);

    let y = 0;
    let started = false;
    let last = { top: 0, height: 0 };
    const place = (el, top, height) => {
      el.style.position = "absolute";
      el.style.top = px(top);
      el.style.height = px(height);
      root.appendChild(el);
      last = { top, height };
      started = true;
    };
    const centred = (text, st) => {
      const el = document.createElement("div");
      el.style.cssText = `left:0;width:${px(W)};box-sizing:border-box;text-align:center;line-height:${px(st.lh)};${st.css}` +
        `padding-left:${st.trackEm}em;`; // letter-spacing adds space after the last letter; re-centre
      el.innerHTML = this._inline(text, st);
      return el;
    };

    const lines = String(d.credits || "").replace(/\r\n?/g, "\n").split("\n");
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      const t = line.trim();
      let m;
      if (t === "") { y += emptyGap; continue; }
      if (t === "---") { y += longGap; continue; }
      if ((m = t.match(/^\[space\s+(-?\d+(?:\.\d+)?)\]$/i))) { y += Math.round(Number(m[1]) * k); continue; }

      if ((m = t.match(/^(#{1,2})\s+(.*)$/))) {
        const st = m[1] === "#" ? S.title : S.section;
        if (started) y += st.before;
        place(centred(m[2], st), y, st.lh);
        y += st.lh;
        y += st.after;
        continue;
      }

      const bar = line.indexOf("|");
      if (bar !== -1) {
        const role = line.slice(0, bar).trim();
        const name = line.slice(bar + 1).trim();
        const row = document.createElement("div");
        row.style.cssText =
          `left:0;width:${px(W)};display:grid;align-items:baseline;` +
          `grid-template-columns:${px(split - halfGap)} ${px(2 * halfGap)} 1fr;`;
        const r = document.createElement("div");
        r.style.cssText = `grid-column:1;text-align:right;overflow:visible;line-height:${px(rowH)};${S.role.css}` +
          `margin-right:${-S.role.trackEm}em;`; // keep the last letter on the column edge
        r.innerHTML = role ? this._inline(role, S.role) : "&nbsp;";
        const n = document.createElement("div");
        n.style.cssText = `grid-column:3;text-align:left;line-height:${px(rowH)};${S.name.css}`;
        n.innerHTML = this._inline(name, S.name);
        row.append(r, n);
        place(row, y, rowH);
        y += rowH;
        continue;
      }

      place(centred(t, S.centre), y, S.centre.lh);
      y += S.centre.lh;
    }

    const contentH = y;
    const ppf = this._ppf();
    let travel;
    if (String(d.endMode).startsWith("Stop")) {
      const target = H - (Math.round(H / 2) - Math.round(last.top + last.height / 2));
      travel = Math.max(0, Math.floor(target / ppf) * ppf);
    } else {
      travel = H + contentH;
    }
    const delay = 0;
    const framesNeeded = delay + Math.ceil(travel / ppf) + 1;

    this.root = root;
    this.layout = { W, H, dpr, contentH, travel, ppf, delay, framesNeeded };

    this.infoEl = null;
    if (d.showInfo) {
      const missing = [...new Set(Object.values(S).map((s) => s.fam.name))].filter((f) => this._fontMissing(f));
      this._missing = missing;
      const info = document.createElement("div");
      info.style.cssText =
        "position:absolute;left:12px;top:12px;padding:8px 12px;background:rgba(170,0,0,.88);" +
        "color:#fff;font:600 16px/1.35 Menlo,Consolas,monospace;white-space:pre;z-index:10;";
      this.appendChild(info);
      this.infoEl = info;
    }
  }

  _render(frame) {
    if (!this.layout) return;
    this._lastFrame = frame;
    const { H, dpr, travel, ppf, delay } = this.layout;
    const moved = Math.min(Math.max(0, frame - delay) * ppf, travel);
    this.root.style.transform = `translate(0px, ${(H - moved) / dpr}px)`;
    this.root.style.visibility = this.visible ? "visible" : "hidden";
    if (this.infoEl) {
      const i = this._info();
      this.infoEl.textContent =
        `frame ${frame}  offset ${moved}px\n` +
        `clip length needed: ${i.framesNeeded} fr  (${i.timecode} @ ${this._fps()} fps)\n` +
        `${ppf} px/frame = ${Math.round(ppf * this._fps())} px/s   content ${i.contentHeight}px\n` +
        (this._missing && this._missing.length
          ? `FONT NOT FOUND: ${this._missing.join(", ")} (using fallback)`
          : "fonts: all found");
    }
  }

  _info() {
    if (!this.layout) return {};
    const { framesNeeded, contentH } = this.layout;
    const nominal = Math.round(this._fps());
    const s = Math.floor(framesNeeded / nominal);
    const tc = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, framesNeeded % nominal]
      .map((n) => String(n).padStart(2, "0")).join(":");
    return { framesNeeded, timecode: tc, contentHeight: contentH };
  }
}
