import "leaflet/dist/leaflet.css";
import "./style.css";
import { NOTES, RAW } from "./data/graves";
import { initMap } from "./map";
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

const map = initMap($("map"), graves, (fig) => {
  q.value = fig;
  render();
  map.select(fig);
});

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
        return `<li class="${g.fig === selectedFig ? "sel" : ""}">
  <button type="button" class="fig" data-fig="${esc(g.fig)}" ${placed ? "" : "disabled title=\"Not marked on the plan\""}>Fig. ${esc(g.fig)}</button>
  <div class="name">${highlight(g.name, terms)}
    <div class="meta">${esc(g.yrs)}${g.yrs && g.role ? " · " : ""}${highlight(g.role, terms)}</div>
    ${note ? `<div class="note">${esc(note)}</div>` : ""}
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

const fromHash = new URLSearchParams(location.hash.slice(1)).get("q");
if (fromHash) q.value = fromHash;
render();
if (fromHash) map.fitMatches();
