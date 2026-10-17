import L from "leaflet";
import planUrl from "./assets/plan.jpg";
import { PLAN_H, PLAN_W, plotFor } from "./data/plots";
import type { Grave } from "./types";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Image pixel (origin top-left) → Leaflet CRS.Simple lat/lng (origin bottom-left). */
const toLatLng = ([x, y]: [number, number]) => L.latLng(PLAN_H - y, x);

export interface PlanMap {
  has(fig: string): boolean;
  showMatches(hits: Grave[]): void;
  fitMatches(): void;
  select(fig: string): void;
}

export function initMap(el: HTMLElement, graves: Grave[], onMarkerClick: (fig: string) => void): PlanMap {
  const bounds = L.latLngBounds([0, 0], [PLAN_H, PLAN_W]);
  const map = L.map(el, {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.25,
    maxBounds: bounds.pad(0.15),
    maxBoundsViscosity: 0.8,
    attributionControl: false,
  });
  L.imageOverlay(planUrl, bounds, { className: "plan", alt: "Planul Cimitirului Bellu with figura numbers" }).addTo(map);
  map.fitBounds(bounds);
  new ResizeObserver(() => map.invalidateSize()).observe(el);

  // One marker per plotted figura label (several graves share a figura).
  const byFig = new Map<string, Grave[]>();
  for (const g of graves) byFig.set(g.fig, [...(byFig.get(g.fig) ?? []), g]);

  const markers = new Map<string, L.CircleMarker>();
  for (const [fig, people] of byFig) {
    const pos = plotFor(fig);
    if (!pos) continue;
    const m = L.circleMarker(toLatLng(pos), { radius: 9, className: "plot" })
      .bindTooltip(`Fig. ${esc(fig)} · ${people.length}`, { direction: "top", offset: [0, -8] })
      .bindPopup(
        () =>
          `<strong>Fig. ${esc(fig)}</strong><ul class="pop">${people
            .map((p) => `<li>${esc(p.name)}${p.yrs ? ` <span>${esc(p.yrs)}</span>` : ""}</li>`)
            .join("")}</ul>`,
        { maxHeight: 220 },
      )
      .on("click", () => onMarkerClick(fig))
      .addTo(map);
    markers.set(fig, m);
  }

  let matched = new Set<string>();
  let selected: string | null = null;

  const restyle = () => {
    for (const [fig, m] of markers) {
      const el = m.getElement();
      if (!el) continue;
      el.classList.toggle("hit", matched.has(fig));
      el.classList.toggle("dim", matched.size > 0 && !matched.has(fig));
      el.classList.toggle("sel", fig === selected);
      if (fig === selected || matched.has(fig)) m.bringToFront();
    }
  };

  return {
    has: (fig) => markers.has(fig),

    showMatches(hits) {
      matched = new Set(hits.map((g) => g.fig).filter((f) => markers.has(f)));
      if (selected && !matched.has(selected)) {
        selected = null;
        map.closePopup();
      }
      restyle();
    },

    fitMatches() {
      if (!matched.size || matched.size === markers.size) return;
      const b = L.latLngBounds([...matched].map((f) => markers.get(f)!.getLatLng()));
      map.flyToBounds(b, { padding: [40, 40], maxZoom: 0.5, duration: 0.6 });
    },

    select(fig) {
      const m = markers.get(fig);
      if (!m) return;
      selected = fig;
      restyle();
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 0.5), { duration: 0.6 });
      m.openPopup();
    },
  };
}
