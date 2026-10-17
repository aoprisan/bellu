import "leaflet/dist/leaflet.css";
import "./style.css";
import { NOTES, RAW } from "./data/graves";
import { PLAN_H, PLAN_W, plotFor } from "./data/plots";
import { BELLU, directionsUrl, gpsToPlan, heading, offset } from "./geo";
import { gmapsLinks, initMap } from "./map";
import type { Grave } from "./types";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const graves: Grave[] = RAW.split("\n").map((line) => {
  const [fig = "", name = "", yrs = "", role = ""] = line.split("|");
  return { fig, name, yrs, role, key: fold(`${fig} ${name} ${role} ${yrs}`) };
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = $<HTMLInputElement>("q");
const list = $<HTMLUListElement>("list");
const count = $<HTMLParagraphElement>("count");
const chips = $<HTMLDivElement>("chips");
const locStatus = $<HTMLParagraphElement>("locstatus");
$<HTMLAnchorElement>("getthere").href = directionsUrl();

/** Wrap every occurrence of any search term in <mark>, matching diacritic-insensitively. */
function highlight(text: string, terms: string[]): string {
  if (!terms.length) return esc(text);
  const f = fold(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const t of terms) {
    for (let i = f.indexOf(t); i > -1; i = f.indexOf(t, i + 1)) {
      for (let j = i; j < i + t.length; j++) marks[j] = true;
    }
  }
  let out = "";
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== open) {
      out += open ? "</mark>" : "<mark>";
      open = !open;
    }
    out += esc(text[i]);
  }
  return out + (open ? "</mark>" : "");
}

function search(query: string): { hits: Grave[]; terms: string[] } {
  const folded = fold(query).trim().replace(/\s+/g, " ");
  if (!folded) return { hits: graves, terms: [] };
  // Exact figura label, e.g. "8 bis" or "1 b.m." (what a marker tap puts in the box)
  const exact = graves.filter((g) => fold(g.fig) === folded);
  if (exact.length) return { hits: exact, terms: [] };
  const terms = folded.split(" ");
  // A bare number searches by figura (e.g. "96" → 96, 96 bis, 96 P.M. …)
  if (terms.length === 1 && /^\d+$/.test(terms[0])) {
    const n = terms[0];
    return { hits: graves.filter((g) => g.fig.split(/[ –(]/)[0] === n || g.fig.startsWith(n + " ")), terms: [] };
  }
  return { hits: graves.filter((g) => terms.every((t) => g.key.includes(t))), terms };
}

const map = initMap(
  $("map"),
  graves,
  (fig) => {
    q.value = fig;
    render();
    map.select(fig);
  },
  toggleLocate,
);

// "Locate me": project the GPS fix onto the plan. Only shown when it lands on (or just around) the plan.
let watchId: number | null = null;
let onSite = false;

function stopLocate(msg = "") {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  map.setLocating(false);
  map.setUser(null);
  locStatus.textContent = msg;
  if (onSite) {
    onSite = false;
    render();
  }
}

function toggleLocate() {
  if (watchId !== null) return stopLocate();
  if (!("geolocation" in navigator)) return stopLocate("This browser can't share your location.");
  map.setLocating(true);
  locStatus.textContent = "Finding your location…";
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const here = { lat: coords.latitude, lng: coords.longitude };
      const [x, y] = gpsToPlan(here);
      const margin = 150; // px, ~ 90 m around the plan
      const wasOnSite = onSite;
      onSite = x > -margin && x < PLAN_W + margin && y > -margin && y < PLAN_H + margin;
      if (onSite) {
        const [, yAcc] = gpsToPlan(offset(here, 0, coords.accuracy));
        const [xAcc] = gpsToPlan(offset(here, coords.accuracy, 0));
        const accPx = Math.max(Math.abs(xAcc - x), Math.abs(yAcc - y), 8);
        map.setUser({ xy: [x, y], accPx });
        locStatus.textContent = `You are on the plan (±${Math.round(coords.accuracy)} m GPS, plot positions ±25 m). Tap a result for the distance to it.`;
      } else {
        map.setUser(null);
        const { m } = heading(here, BELLU);
        locStatus.innerHTML = `You're about ${m < 10_000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)} km from Bellu. <a href="${esc(directionsUrl())}" target="_blank" rel="noopener">Directions to the cemetery</a>`;
      }
      if (onSite !== wasOnSite) render();
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) return stopLocate("Location permission was denied.");
      // Timeouts / no fix are often transient (indoors, between fixes): keep watching.
      if (!onSite) locStatus.textContent = "Still looking for a GPS fix; try again outdoors.";
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
  );
}

let selectedFig: string | null = null;

function render() {
  const { hits, terms } = search(q.value);
  const searching = q.value.trim() !== "";
  count.textContent = searching
    ? `${hits.length} match${hits.length === 1 ? "" : "es"}`
    : `${graves.length} graves listed`;

  list.innerHTML =
    hits
      .map((g) => {
        const placed = map.has(g.fig);
        const note = NOTES[g.name];
        const pos = plotFor(g.fig);
        return `<li class="${g.fig === selectedFig ? "sel" : ""}">
  <button type="button" class="fig" data-fig="${esc(g.fig)}" ${placed ? "" : "disabled title=\"Not marked on the plan\""}>Fig. ${esc(g.fig)}</button>
  <div class="name">${highlight(g.name, terms)}
    <div class="meta">${esc(g.yrs)}${g.yrs && g.role ? " · " : ""}${highlight(g.role, terms)}</div>
    ${note ? `<div class="note">${esc(note)}</div>` : ""}
    ${pos ? `<div class="gm">${gmapsLinks(pos, onSite)}</div>` : ""}
  </div>
</li>`;
      })
      .join("") ||
    `<li class="empty"><div class="meta">No one on the board matches. The board is not exhaustive; ask at the gate office (Calea Șerban Vodă).</div></li>`;

  map.showMatches(searching ? hits : []);
  const url = new URL(location.href);
  url.hash = searching ? `q=${encodeURIComponent(q.value.trim())}` : "";
  history.replaceState(null, "", url);
}

function selectFig(fig: string) {
  selectedFig = fig;
  for (const li of list.querySelectorAll("li")) {
    li.classList.toggle("sel", li.querySelector<HTMLElement>(".fig")?.dataset.fig === fig);
  }
  map.select(fig);
  // On narrow screens the map sits above the list; bring it into view.
  if (matchMedia("(max-width: 899px)").matches) {
    $("map").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

list.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) return; // Google Maps links
  const li = (e.target as HTMLElement).closest("li");
  const fig = li?.querySelector<HTMLButtonElement>(".fig");
  if (fig && !fig.disabled && fig.dataset.fig) selectFig(fig.dataset.fig);
});

let fitTimer: number | undefined;
q.addEventListener("input", () => {
  selectedFig = null;
  render();
  clearTimeout(fitTimer);
  fitTimer = window.setTimeout(() => map.fitMatches(), 450);
});

const examples = ["Caramitru", "Minulescu", "Eminescu", "Laura Stoica", "96", "actor"];
chips.innerHTML = examples.map((c) => `<button type="button">${esc(c)}</button>`).join("");
chips.addEventListener("click", (e) => {
  const b = e.target as HTMLElement;
  if (b.tagName !== "BUTTON") return;
  q.value = b.textContent ?? "";
  selectedFig = null;
  render();
  map.fitMatches();
});

function loadHash() {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("q") ?? "";
  if (fromHash === q.value.trim()) return;
  q.value = fromHash;
  selectedFig = null;
  render();
  map.fitMatches();
}
addEventListener("hashchange", loadHash);
// Read the hash before the first render, which rewrites it.
loadHash();
render();
