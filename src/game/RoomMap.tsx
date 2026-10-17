import { useStore } from "@nanostores/react";
import * as L from "leaflet";
import { useEffect, useState } from "react";

import { leafletMapContext } from "@/lib/context";
import { useText } from "@/oslo/i18n";

import {
    action,
    actionBusy,
    api,
    credentials,
    mapDraft,
    mapTool,
    pickedPoint,
    room,
} from "./client";

export function RoomMap() {
    const map = useStore(leafletMapContext),
        value = useStore(room),
        tool = useStore(mapTool),
        draft = useStore(mapDraft),
        pin = useStore(pickedPoint),
        t = useText(),
        busy = useStore(actionBusy);
    useEffect(() => {
        if (!map || !value) return;
        const group = L.layerGroup().addTo(map);
        const g = value.game;
        if (g.boundary.length)
            L.polygon(g.boundary, {
                color: "#447259",
                weight: 2,
                dashArray: "6 5",
                fillOpacity: 0,
                interactive: false,
            }).addTo(group);
        for (const q of g.questions) {
            if (q.category === "radar" && q.start && q.distance)
                L.circle(q.start, {
                    radius: q.distance,
                    color: "#8b5ba0",
                    weight: 2,
                    fillOpacity: 0.035,
                    interactive: false,
                }).addTo(group);
            if (q.category === "thermometer" && q.start) {
                L.circleMarker(q.start, {
                    radius: 6,
                    color: "#9b7550",
                    fillOpacity: 1,
                })
                    .bindTooltip("A")
                    .addTo(group);
                if (q.end) {
                    L.circleMarker(q.end, {
                        radius: 6,
                        color: "#985c5c",
                        fillOpacity: 1,
                    })
                        .bindTooltip("B")
                        .addTo(group);
                    L.polyline([q.start, q.end], {
                        color: "#8a6e70",
                        weight: 2,
                        dashArray: "4 5",
                        interactive: false,
                    }).addTo(group);
                }
            }
        }
        for (const mark of g.marks) {
            const node = document.createElement("strong");
            node.textContent = mark.label;
            if (mark.kind === "exclude")
                L.polygon(mark.points, {
                    color: "#a85f66",
                    weight: 1,
                    fillColor: "#9c6570",
                    fillOpacity: 0.22,
                })
                    .bindPopup(node)
                    .addTo(group);
            else if (mark.kind === "circle")
                L.circle(mark.points[0], {
                    radius: mark.radius || 100,
                    color: "#6f7295",
                    weight: 2,
                    fillOpacity: 0.04,
                })
                    .bindPopup(node)
                    .addTo(group);
            else
                L.circleMarker(mark.points[0], {
                    radius: 6,
                    color: "#2b4e69",
                    fillColor: "#fff",
                    fillOpacity: 1,
                })
                    .bindPopup(node)
                    .addTo(group);
        }
        const now = Date.now();
        for (const loc of value.locations) {
            const team = g.teams.find((t) => t.id === loc.team),
                old = now - loc.at > 60000,
                node = document.createElement("div");
            const title = document.createElement("strong");
            title.textContent = `${loc.name} · ${team?.name || ""}`;
            const stamp = document.createElement("small");
            stamp.textContent = `${new Date(loc.at).toLocaleTimeString()} · ±${Math.round(loc.accuracy)} m`;
            node.append(title, document.createElement("br"), stamp);
            L.circle(loc.point, {
                radius: loc.accuracy,
                color: team?.color,
                weight: 1,
                fillOpacity: old ? 0.02 : 0.07,
                interactive: false,
            }).addTo(group);
            L.circleMarker(loc.point, {
                radius: 6,
                color: "#fff",
                weight: 2,
                fillColor: team?.color || "#365f76",
                fillOpacity: old ? 0.35 : 1,
            })
                .bindPopup(node)
                .addTo(group);
        }
        return () => {
            group.remove();
        };
    }, [map, value]);
    useEffect(() => {
        if (!map || !value) return;
        const group = L.layerGroup().addTo(map);
        if (pin)
            L.circleMarker(pin, {
                radius: 7,
                color: "#15394f",
                fillColor: "#f5cf48",
                fillOpacity: 1,
                weight: 2,
                interactive: false,
            }).addTo(group);
        if (draft.length) {
            L.polyline(draft, {
                color: "#59856b",
                dashArray: "5 5",
                interactive: false,
            }).addTo(group);
            for (const p of draft)
                L.circleMarker(p, {
                    radius: 3,
                    color: "#457659",
                    fillOpacity: 1,
                    interactive: false,
                }).addTo(group);
        }
        return () => {
            group.remove();
        };
    }, [map, value, pin, draft]);
    useEffect(() => {
        if (!map || !value || !tool) return;
        const click = (e: L.LeafletMouseEvent) => {
            const point: [number, number] = [e.latlng.lat, e.latlng.lng];
            if (tool === "point") {
                pickedPoint.set(point);
                mapTool.set(null);
            } else mapDraft.set([...mapDraft.get(), point]);
        };
        map.on("click", click);
        map.getContainer().classList.add("choosing-pin");
        return () => {
            map.off("click", click);
            map.getContainer().classList.remove("choosing-pin");
        };
    }, [map, value, tool]);
    if (!value || !tool) return null;
    return (
        <div className="room-map-instructions">
            <span>
                {tool === "point"
                    ? t("Klikk for å velge punkt", "Click to choose a pin")
                    : t("Klikk rundt området", "Click around the area")}
                {tool !== "point" ? ` · ${draft.length}` : ""}
            </span>
            {tool !== "point" && (
                <button
                    disabled={draft.length < 3 || busy}
                    onClick={async () => {
                        const ok =
                            tool === "boundary"
                                ? await action("boundary", { points: draft })
                                : await action("mark", {
                                      kind: "exclude",
                                      points: draft,
                                      label: t("Utelukket", "Excluded"),
                                  });
                        if (ok) {
                            mapTool.set(null);
                            mapDraft.set([]);
                        }
                    }}
                >
                    {t("Lagre", "Save")}
                </button>
            )}
            <button
                onClick={() => {
                    mapTool.set(null);
                    mapDraft.set([]);
                }}
            >
                {t("Avbryt", "Cancel")}
            </button>
        </div>
    );
}

export function LocationSharing() {
    const value = useStore(room),
        t = useText(),
        [sharing, setSharing] = useState(false),
        [error, setError] = useState("");
    useEffect(() => {
        if (!sharing || !value || value.me.hider) return;
        const membership = credentials.get();
        if (!membership) return;
        let stopped = false,
            last = 0;
        const send = (position: GeolocationPosition) => {
            const c = membership;
            if (!c || Date.now() - last < 8000) return;
            last = Date.now();
            api(
                `/api/rooms/${c.code}/location`,
                {
                    location: {
                        point: [
                            position.coords.latitude,
                            position.coords.longitude,
                        ],
                        accuracy: position.coords.accuracy,
                    },
                },
                c.token,
            ).catch(() => {
                if (!stopped)
                    setError(
                        t(
                            "Posisjonen kunne ikke deles.",
                            "Location could not be shared.",
                        ),
                    );
            });
        };
        const watch = navigator.geolocation.watchPosition(
            send,
            () => {
                setError(
                    t(
                        "Posisjon er ikke tilgjengelig.",
                        "Location is unavailable.",
                    ),
                );
                setSharing(false);
            },
            { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 },
        );
        return () => {
            stopped = true;
            navigator.geolocation.clearWatch(watch);
            const c = membership;
            if (c)
                void api(
                    `/api/rooms/${c.code}/location`,
                    {
                        location: null,
                    },
                    c.token,
                ).catch(() => {});
        };
    }, [sharing, value?.me.hider, value?.game.code]);
    useEffect(() => {
        if (
            value?.me.hider ||
            !["seeking", "endgame"].includes(value?.game.phase || "")
        )
            setSharing(false);
    }, [value?.me.hider, value?.game.phase]);
    if (!value || value.me.hider) return null;
    return (
        <div className="location-sharing">
            <label className="check-label">
                <input
                    type="checkbox"
                    checked={sharing}
                    disabled={
                        !["seeking", "endgame"].includes(value.game.phase)
                    }
                    onChange={(e) => {
                        setError("");
                        if (!navigator.geolocation) {
                            setError(
                                t(
                                    "Posisjon er ikke tilgjengelig.",
                                    "Location is unavailable.",
                                ),
                            );
                            return;
                        }
                        setSharing(e.target.checked);
                    }}
                />
                {t("Del min posisjon", "Share my location")}
            </label>
            {sharing && (
                <p className="small muted">
                    {t("Hold appen åpen.", "Keep the app open.")}
                </p>
            )}
            {error && <p className="room-error">{error}</p>}
        </div>
    );
}
