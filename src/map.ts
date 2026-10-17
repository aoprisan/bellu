import L from "leaflet";
import planUrl from "./assets/plan.jpg";
import { PLAN_H, PLAN_W, plotFor } from "./data/plots";
import { directionsUrl, heading, mapsUrl, planToGps } from "./geo";
import type { Grave } from "./types";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Image pixel (origin top-left) → Leaflet CRS.Simple lat/lng (origin bottom-left). */
const toLatLng = ([x, y]: [number, number]) => L.latLng(PLAN_H - y, x);

/** The user's position projected onto the plan (pixels), with GPS accuracy as a radius in plan pixels. */
export interface UserPos {
  xy: [number, number];
  accPx: number;
}

export interface PlanMap {
  has(fig: string): boolean;
  showMatches(hits: Grave[]): void;
  fitMatches(): void;
  select(fig: string): void;
  setUser(pos: UserPos | null): void;
  setLocating(on: boolean): void;
}

/** Google Maps links for a plot, shared by the popup and the results list. */
export function gmapsLinks(xy: [number, number], walking: boolean): string {
  const at = planToGps(xy);
  return `<a href="${esc(directionsUrl(at, walking))}" target="_blank" rel="noopener">Directions</a> · <a href="${esc(mapsUrl(at))}" target="_blank" rel="noopener">Google Maps</a>`;
}

export function initMap(
  el: HTMLElement,
  graves: Grave[],
  onMarkerClick: (fig: string) => void,
  onLocateClick: () => void,
): PlanMap {
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

  const LocateControl = L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create("div", "leaflet-bar locate");
      const a = L.DomUtil.create("a", "", bar);
      a.href = "#";
      a.role = "button";
      a.title = a.ariaLabel = "Show my location on the plan";
      a.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(a, "click", (e) => {
        L.DomEvent.preventDefault(e);
        onLocateClick();
      });
      return bar;
    },
  });
  const locateCtl = new LocateControl({ position: "topleft" }).addTo(map);

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
            .join("")}</ul><p class="gm">${gmapsLinks(pos, user !== null)}</p>`,
        { maxHeight: 220 },
      )
      .on("click", () => onMarkerClick(fig))
      .addTo(map);
    markers.set(fig, m);
  }

  let matched = new Set<string>();
  let selected: string | null = null;
  let user: UserPos | null = null;
  let firstFix = true;
  const userAcc = L.circle([0, 0], { radius: 1, className: "user-acc", interactive: false });
  const userDot = L.circleMarker([0, 0], { radius: 7, className: "user", interactive: false });
  const guide = L.polyline([], { className: "guide", interactive: false });

  /** Dashed line from the user to the selected plot, labelled with distance and direction. */
  const updateGuide = () => {
    const m = selected ? markers.get(selected) : undefined;
    if (!user || !m) {
      guide.remove();
      return;
    }
    const sel = plotFor(selected!)!;
    const { m: dist, dir } = heading(planToGps(user.xy), planToGps(sel));
    guide.setLatLngs([toLatLng(user.xy), m.getLatLng()]).addTo(map);
    const label = dist < 25 ? "You are here" : `~${Math.round(dist / 10) * 10} m ${dir}`;
    guide.unbindTooltip().bindTooltip(label, { permanent: true, direction: "center", className: "guide-tip" });
  };

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
        updateGuide();
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
      updateGuide();
      if (user) map.flyToBounds(L.latLngBounds([toLatLng(user.xy), m.getLatLng()]), { padding: [50, 50], maxZoom: 1, duration: 0.6 });
      else map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 0.5), { duration: 0.6 });
      m.openPopup();
    },

    setUser(pos) {
      user = pos;
      if (!pos) {
        userAcc.remove();
        userDot.remove();
        firstFix = true;
      } else {
        const ll = toLatLng(pos.xy);
        userAcc.setLatLng(ll).setRadius(pos.accPx).addTo(map);
        userDot.setLatLng(ll).addTo(map).bringToFront();
        if (firstFix) map.flyTo(ll, Math.max(map.getZoom(), 0.5), { duration: 0.6 });
        firstFix = false;
      }
      updateGuide();
    },

    setLocating(on) {
      locateCtl.getContainer()?.classList.toggle("on", on);
    },
  };
}
