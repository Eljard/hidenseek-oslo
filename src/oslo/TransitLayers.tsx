import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect } from "react";

import { leafletMapContext } from "@/lib/context";

import {
    language,
    lineVisible,
    selectedLine,
    transitData,
    transitPrefs,
} from "./state";

export function TransitLayers() {
    const map = useStore(leafletMapContext),
        data = useStore(transitData),
        prefs = useStore(transitPrefs),
        selected = useStore(selectedLine),
        lang = useStore(language);
    useEffect(() => {
        if (!map || !data) return;
        if (!map.getPane("transit"))
            map.createPane("transit").style.zIndex = "440";
        const group = L.layerGroup().addTo(map);
        const renderer = L.canvas({ pane: "transit", padding: 0.3 });
        const labels = (ids: string[]) =>
            ids
                .map((id) => data.lines.find((l) => l.id === id))
                .filter(Boolean)
                .map((l) => l!.code)
                .join(" · ");
        const show = () => {
            group.clearLayers();
            const zoom = map.getZoom();
            const visible = data.lines.filter((l) => lineVisible(l, prefs));
            const sorted = [...visible].sort(
                (a, b) =>
                    (a.id === selected ? 1 : 0) - (b.id === selected ? 1 : 0),
            );
            for (const line of sorted) {
                const active = line.id === selected;
                if (line.mode === "bus" && zoom < 11 && !active) continue;
                const index = visible
                    .filter((l) => l.mode === line.mode)
                    .findIndex((l) => l.id === line.id);
                const weight = active ? 7 : line.mode === "bus" ? 2.4 : 4;
                const path = L.geoJSON(line.geometry, {
                    pane: "transit",
                    style: {
                        renderer,
                        color: line.color,
                        weight,
                        opacity: active
                            ? 1
                            : selected
                              ? prefs.opacity * 0.33
                              : prefs.opacity,
                        dashArray: line.mode === "rail" ? "10 3" : undefined,
                        lineCap: "round",
                    },
                });
                // Expose colors along shared corridors without shifting coordinates.
                if (!active && ["metro", "tram"].includes(line.mode))
                    path.setStyle({
                        dashArray: "14 5",
                        dashOffset: String(index * 5),
                    });
                path.on("click", (event: L.LeafletMouseEvent) => {
                    selectedLine.set(line.id);
                    L.DomEvent.stopPropagation(event);
                });
                path.addTo(group);
            }
            if ((prefs.stops && zoom >= 13) || selected) {
                const ids = new Set(
                    visible
                        .filter((l) => !selected || l.id === selected)
                        .map((l) => l.id),
                );
                for (const stop of data.stops) {
                    if (!stop.lines.some((id) => ids.has(id))) continue;
                    if (
                        !map.getBounds().pad(0.1).contains([stop.lat, stop.lng])
                    )
                        continue;
                    const node = document.createElement("div");
                    const title = document.createElement("strong");
                    title.textContent = stop.name;
                    node.append(
                        title,
                        document.createElement("br"),
                        document.createTextNode(labels(stop.lines)),
                    );
                    L.circleMarker([stop.lat, stop.lng], {
                        pane: "transit",
                        renderer,
                        radius: selected ? 4 : 3,
                        color: "#243944",
                        weight: 1.5,
                        fillColor: "#fffdf7",
                        fillOpacity: 1,
                    })
                        .bindPopup(node)
                        .addTo(group);
                }
            }
        };
        show();
        map.on("zoomend moveend", show);
        return () => {
            map.off("zoomend moveend", show);
            group.remove();
            renderer.remove();
        };
    }, [map, data, prefs, selected, lang]);
    return null;
}
