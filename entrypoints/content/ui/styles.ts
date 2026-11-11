const FONT = `TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

export const BUTTON_CSS = `
:host { display: flex; align-items: center; margin-left: 4px; }
button {
  all: unset; box-sizing: border-box; cursor: pointer;
  position: relative; display: inline-flex; align-items: center; gap: 4px;
  height: 34px; padding: 0 10px; border-radius: 9999px;
  font: 600 13px/1 ${FONT}; color: var(--gz-color, rgb(113,118,123));
  transition: background-color .15s, color .15s;
}
button:hover, button:focus-visible { color: rgb(29,155,240); background: rgba(29,155,240,.1); }
button:focus-visible { outline: 2px solid rgb(29,155,240); outline-offset: 1px; }
svg { width: 18px; height: 18px; flex: none; }
.ring { display: none; }
:host([data-state="running"]) .icon { display: none; }
:host([data-state="running"]) .ring { display: block; }
:host([data-state="running"]) button { color: rgb(29,155,240); }
:host([data-state="done"]) button { color: rgb(0,186,124); }
:host([data-state="error"]) button { color: rgb(244,33,46); }
.ring circle { fill: none; stroke-width: 3; }
.ring .track { stroke: currentColor; opacity: .2; }
.ring .bar { stroke: currentColor; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset .2s; }
.pct { font-variant-numeric: tabular-nums; min-width: 2.6em; text-align: left; }
`;

export const POPOVER_CSS = `
:host { all: initial; position: absolute; z-index: 2147483000; }
* { box-sizing: border-box; }
.panel {
  --bg: #fff; --fg: #0f1419; --muted: #536471; --border: #cfd9de; --chip: #eff3f4; --accent: rgb(29,155,240);
  --ok: rgb(0,186,124); --err: rgb(244,33,46); --warn: rgb(255,173,31);
  width: 320px; max-width: calc(100vw - 16px); padding: 14px 16px 16px; border-radius: 16px;
  background: var(--bg); color: var(--fg); font: 14px/1.35 ${FONT};
  box-shadow: rgba(101,119,134,.2) 0 0 15px, rgba(101,119,134,.15) 0 0 3px 1px;
}
.panel.dark {
  --bg: #000; --fg: #e7e9ea; --muted: #71767b; --border: #333639; --chip: #202327;
  box-shadow: rgba(255,255,255,.2) 0 0 15px, rgba(255,255,255,.15) 0 0 3px 1px;
}
header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
h2 { margin: 0; font-size: 16px; font-weight: 800; }
.close { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; color: var(--fg); }
.close:hover { background: var(--chip); }
.row { margin: 10px 0; }
.label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin-bottom: 5px; }
.seg { display: flex; gap: 6px; flex-wrap: wrap; }
.seg button {
  all: unset; cursor: pointer; padding: 5px 11px; border-radius: 9999px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border); color: var(--fg);
}
.seg button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.seg button:disabled { opacity: .4; cursor: default; }
.name { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.name:focus-within { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.name input { all: unset; flex: 1; min-width: 0; padding: 8px 10px; font-size: 14px; color: var(--fg); }
.name span { padding: 0 10px; color: var(--muted); font-size: 13px; }
.check { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }
.check input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.btn {
  all: unset; cursor: pointer; flex: 1; text-align: center; padding: 9px 12px; border-radius: 9999px;
  font-weight: 700; font-size: 14px; border: 1px solid var(--border); color: var(--fg);
}
.btn.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); }
.btn:hover { opacity: .88; }
.btn:disabled { opacity: .5; cursor: default; }
.hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
.status { margin-top: 12px; font-size: 13px; }
.bar { height: 4px; border-radius: 2px; background: var(--chip); overflow: hidden; margin-top: 6px; }
.bar > div { height: 100%; width: 0; background: var(--accent); transition: width .2s; }
.status.error { color: var(--err); }
.warn { color: var(--warn); font-size: 12px; margin-top: 6px; }
.preview { margin-top: 12px; }
.preview img { display: block; max-width: 100%; max-height: 200px; margin: 0 auto 8px; border-radius: 8px; }
.preview .info { font-size: 12px; color: var(--muted); text-align: center; }
.hidden { display: none !important; }
`;

export const TOAST_CSS = `
:host { all: initial; position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483001; }
div {
  font: 15px/1.35 ${FONT}; color: #fff; background: rgb(29,155,240); padding: 12px 18px; border-radius: 6px;
  box-shadow: rgba(0,0,0,.25) 0 2px 10px; max-width: min(520px, calc(100vw - 32px));
  animation: in .2s ease-out;
}
div.warn { background: #536471; }
@keyframes in { from { opacity: 0; transform: translateY(8px); } }
`;
