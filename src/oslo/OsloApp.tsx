import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as L from "leaflet";
import {
    ArrowUpRight,
    BusFront,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Compass,
    Layers,
    LocateFixed,
    MapPin,
    Plus,
    Route,
    Search,
    SlidersHorizontal,
    Target,
    TrainFront,
    TramFront,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

import { Map } from "@/components/Map";
import { connectRoom, credentials, leaveRoom, room } from "@/game/client";
import { RoomMap } from "@/game/RoomMap";
import { RoomPanel } from "@/game/RoomPanel";
import {
    hiderMode,
    leafletMapContext,
    mapGeoJSON,
    multiplayerActive,
    polyGeoJSON,
} from "@/lib/context";
import { modeColours } from "@/transit/colours.mjs";

import { useText } from "./i18n";
import {
    language,
    lineVisible,
    loadTransit,
    type Mode,
    osloBounds,
    selectedLine,
    transitData,
    transitError,
    transitPrefs,
} from "./state";
import { TransitLayers } from "./TransitLayers";
import { useModalFocus } from "./useModalFocus";

const modeInfo = {
    metro: {
        nb: "T-bane",
        en: "Metro",
        icon: TrainFront,
        color: modeColours.metro,
        tag: "T",
    },
    tram: {
        nb: "Trikk",
        en: "Tram",
        icon: TramFront,
        color: modeColours.tram,
        tag: "TR",
    },
    bus: {
        nb: "Buss",
        en: "Bus",
        icon: BusFront,
        color: modeColours.bus,
        tag: "B",
    },
    rail: {
        nb: "Tog",
        en: "Train",
        icon: TrainFront,
        color: modeColours.rail,
        tag: "R",
    },
};
const modes = Object.keys(modeInfo) as Mode[];
function routeBadgeStyle(color: string) {
    const rgb = color
        .replace("#", "")
        .match(/../g)!
        .map((c) => parseInt(c, 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return {
        background: color,
        color: luminance > 0.179 ? "#000" : "#fff",
        textShadow: "none",
    };
}

function NetworkPanel() {
    const t = useText(),
        data = useStore(transitData),
        error = useStore(transitError),
        prefs = useStore(transitPrefs),
        selected = useStore(selectedLine);
    const [expanded, setExpanded] = useState<Mode | null>(null),
        [filter, setFilter] = useState("");
    const update = (patch: Partial<typeof prefs>) =>
        transitPrefs.set({ ...prefs, ...patch });
    return (
        <>
            <div className="panel-heading">
                <h2>{t("Kollektivnettet", "Transit network")}</h2>
                <Layers size={17} />
            </div>
            <p className="muted small">
                {t(
                    "Velg hvilke linjer du vil ha på kartet.",
                    "Choose the lines you want on your map.",
                )}
            </p>
            <div className="mode-list">
                {modes.map((mode) => {
                    const info = modeInfo[mode],
                        Icon = info.icon,
                        lines =
                            data?.lines.filter((l) => l.mode === mode) || [];
                    return (
                        <section
                            className={`mode-row ${prefs.modes[mode] ? "enabled" : ""}`}
                            key={mode}
                            style={
                                { "--mode": info.color } as React.CSSProperties
                            }
                        >
                            <div className="mode-summary">
                                <span className="mode-icon">
                                    <Icon size={21} />
                                </span>
                                <button
                                    className="mode-name"
                                    aria-expanded={expanded === mode}
                                    onClick={() => {
                                        setExpanded(
                                            expanded === mode ? null : mode,
                                        );
                                        setFilter("");
                                    }}
                                >
                                    <strong>{t(info.nb, info.en)}</strong>
                                    <span>
                                        {lines.length
                                            ? `${lines.length} ${t("linjer", "lines")}`
                                            : t(
                                                  "Henter linjer…",
                                                  "Loading lines…",
                                              )}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className="switch"
                                    role="switch"
                                    aria-label={t(info.nb, info.en)}
                                    aria-checked={prefs.modes[mode]}
                                    onClick={() => {
                                        update({
                                            modes: {
                                                ...prefs.modes,
                                                [mode]: !prefs.modes[mode],
                                            },
                                        });
                                        selectedLine.set(null);
                                    }}
                                >
                                    <span />
                                </button>
                                <button
                                    className="expand-mode"
                                    aria-label={`${t("Velg linjer", "Choose lines")}: ${t(info.nb, info.en)}`}
                                    onClick={() => {
                                        setExpanded(
                                            expanded === mode ? null : mode,
                                        );
                                        setFilter("");
                                    }}
                                >
                                    {expanded === mode ? (
                                        <ChevronDown size={16} />
                                    ) : (
                                        <ChevronRight size={16} />
                                    )}
                                </button>
                            </div>
                            {expanded === mode && (
                                <div className="line-options">
                                    <label className="line-search">
                                        <Search size={14} />
                                        <input
                                            placeholder={t(
                                                "Søk etter linje",
                                                "Filter lines",
                                            )}
                                            value={filter}
                                            onChange={(e) =>
                                                setFilter(e.target.value)
                                            }
                                        />
                                    </label>
                                    <div className="line-grid">
                                        {lines
                                            .filter((l) =>
                                                `${l.code} ${l.name}`
                                                    .toLowerCase()
                                                    .includes(
                                                        filter.toLowerCase(),
                                                    ),
                                            )
                                            .map((line) => (
                                                <div
                                                    key={line.id}
                                                    className="line-option"
                                                >
                                                    <button
                                                        className="line-badge"
                                                        style={routeBadgeStyle(
                                                            line.color,
                                                        )}
                                                        aria-label={`${t("Vis linje", "Inspect line")} ${line.code}`}
                                                        aria-pressed={
                                                            selected === line.id
                                                        }
                                                        onClick={() => {
                                                            if (
                                                                !lineVisible(
                                                                    line,
                                                                    prefs,
                                                                )
                                                            ) {
                                                                update({
                                                                    modes: {
                                                                        ...prefs.modes,
                                                                        [mode]: true,
                                                                    },
                                                                    hidden: prefs.hidden.filter(
                                                                        (id) =>
                                                                            id !==
                                                                            line.id,
                                                                    ),
                                                                });
                                                            }
                                                            selectedLine.set(
                                                                selected ===
                                                                    line.id
                                                                    ? null
                                                                    : line.id,
                                                            );
                                                        }}
                                                    >
                                                        {line.code}
                                                    </button>
                                                    <label>
                                                        <input
                                                            type="checkbox"
                                                            aria-label={`${t("Linje", "Line")} ${line.code}: ${line.name}`}
                                                            checked={
                                                                !prefs.hidden.includes(
                                                                    line.id,
                                                                )
                                                            }
                                                            onChange={(e) => {
                                                                update({
                                                                    hidden: e
                                                                        .target
                                                                        .checked
                                                                        ? prefs.hidden.filter(
                                                                              (
                                                                                  id,
                                                                              ) =>
                                                                                  id !==
                                                                                  line.id,
                                                                          )
                                                                        : [
                                                                              ...prefs.hidden,
                                                                              line.id,
                                                                          ],
                                                                });
                                                                selectedLine.set(
                                                                    null,
                                                                );
                                                            }}
                                                        />
                                                        {t("Vis", "Show")}
                                                    </label>
                                                </div>
                                            ))}
                                    </div>
                                    {!lines.length && (
                                        <p className="small muted">
                                            {t(
                                                "Ingen linjer tilgjengelig.",
                                                "No lines available.",
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
            <div className="inline-actions">
                <button
                    onClick={() => {
                        update({
                            modes: {
                                metro: true,
                                tram: true,
                                bus: true,
                                rail: true,
                            },
                            hidden: [],
                        });
                        selectedLine.set(null);
                    }}
                >
                    {t("Vis alle", "Show all")}
                </button>
                <span>·</span>
                <button
                    onClick={() => {
                        update({
                            modes: {
                                metro: false,
                                tram: false,
                                bus: false,
                                rail: false,
                            },
                        });
                        selectedLine.set(null);
                    }}
                >
                    {t("Skjul alle", "Hide all")}
                </button>
            </div>
            <div className="overlay-options">
                <label className="range-label">
                    <span>
                        <SlidersHorizontal size={15} />
                        {t("Synlighet", "Opacity")}
                    </span>
                    <b>{Math.round(prefs.opacity * 100)}%</b>
                    <input
                        type="range"
                        min=".15"
                        max="1"
                        step=".05"
                        value={prefs.opacity}
                        onChange={(e) =>
                            update({ opacity: Number(e.target.value) })
                        }
                    />
                </label>
                <label className="check-label">
                    <input
                        type="checkbox"
                        checked={prefs.stops}
                        onChange={(e) => update({ stops: e.target.checked })}
                    />
                    <span>
                        {t("Vis holdeplasser", "Show stops")}
                        <small>
                            {t(
                                "Synlige når du zoomer inn",
                                "Visible when zoomed in",
                            )}
                        </small>
                    </span>
                </label>
            </div>

            {error ? (
                <div className="error-note" role="alert">
                    {t(
                        "Kunne ikke laste kollektivnettet.",
                        "Could not load the transit network.",
                    )}{" "}
                    <button onClick={loadTransit}>
                        {t("Prøv igjen", "Retry")}
                    </button>
                </div>
            ) : !data ? (
                <p role="status" className="small muted">
                    {t("Henter kollektivnettet…", "Loading transit network…")}
                </p>
            ) : (
                <details className="data-note">
                    <summary>{t("Kartdata", "Map data")}</summary>
                    <div>
                        {t(
                            "Nettverkskart, ikke sanntid.",
                            "Network map, not live service.",
                        )}{" "}
                        {data.omittedPatterns > 0 && (
                            <span className="coverage-note">
                                {t(
                                    "Noen avganger mangler nøyaktig geometri og er utelatt, blant annet Flytoget.",
                                    "Some services lack accurate geometry and are omitted, including Flytoget.",
                                )}
                            </span>
                        )}
                        <br />
                        {t(
                            "Linjefarger: Ruter. Tog: Bane NOR.",
                            "Line colours: Ruter. Trains: Bane NOR.",
                        )}
                        <br />
                        {t("Datert", "Snapshot")}{" "}
                        {new Date(data.fetchedAt).toLocaleDateString(
                            t("nb-NO", "en-GB"),
                        )}{" "}
                        ·{" "}
                        <a
                            href="https://developer.entur.no/terms-of-service"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Entur / NLOD
                        </a>
                        <br />
                        <a
                            href="https://ruter.no/planlegg-reise/rutetabeller-og-linjekart"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t(
                                "Se Ruters offisielle linjekart",
                                "Ruter official network maps",
                            )}{" "}
                            ↗
                        </a>
                    </div>
                </details>
            )}
        </>
    );
}

function PlaceSearch() {
    const t = useText(),
        data = useStore(transitData),
        map = useStore(leafletMapContext);
    const [text, setText] = useState(""),
        [results, setResults] = useState<
            { id: string; name: string; lat: number; lng: number }[]
        >([]),
        [status, setStatus] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        if (text.trim().length < 2) {
            setResults([]);
            setStatus("");
            return;
        }
        const local =
            data?.stops
                .filter((s) =>
                    s.name
                        .toLocaleLowerCase("nb")
                        .includes(text.toLocaleLowerCase("nb")),
                )
                .filter(
                    (stop, index, list) =>
                        list.findIndex(
                            (other) =>
                                other.name === stop.name &&
                                turf.distance(
                                    [other.lng, other.lat],
                                    [stop.lng, stop.lat],
                                ) < 0.3,
                        ) === index,
                )
                .slice(0, 6) || [];
        setResults(local);
        setStatus("");
        const timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams({
                    text,
                    size: "5",
                    lang: language.get() === "nb" ? "no" : "en",
                    "boundary.rect.min_lat": "59.7",
                    "boundary.rect.max_lat": "60.15",
                    "boundary.rect.min_lon": "10.35",
                    "boundary.rect.max_lon": "11.15",
                });
                const r = await fetch(
                    `https://api.entur.io/geocoder/v3/autocomplete?${params}`,
                    {
                        headers: { "ET-Client-Name": "eljard-hidenseek-oslo" },
                        signal: controller.signal,
                    },
                );
                if (!r.ok) throw Error();
                const body = await r.json();
                const remote = body.features.map((f: any) => ({
                    id: f.properties.id,
                    name: f.properties.label,
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                }));
                setResults(
                    [
                        ...local,
                        ...remote.filter(
                            (f: any) => !local.some((l) => l.id === f.id),
                        ),
                    ].slice(0, 8),
                );
                if (!local.length && !remote.length) setStatus("empty");
            } catch {
                if (!controller.signal.aborted)
                    setStatus(local.length ? "" : "error");
            }
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [text, data]);
    const select = (p: (typeof results)[number]) => {
        map?.setView([p.lat, p.lng], 15);
        const el = document.createElement("strong");
        el.textContent = p.name;
        L.popup().setLatLng([p.lat, p.lng]).setContent(el).openOn(map!);
        setText("");
        setResults([]);
    };
    return (
        <div className="place-search">
            <Search size={19} />
            <input
                aria-label={t(
                    "Søk etter sted eller holdeplass",
                    "Search places or stops",
                )}
                placeholder={t(
                    "Søk sted eller holdeplass",
                    "Search places or stops",
                )}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") setText("");
                    if (e.key === "Enter" && results[0]) select(results[0]);
                }}
            />
            {text ? (
                <button
                    aria-label={t("Lukk søk", "Close search")}
                    onClick={() => setText("")}
                >
                    <X size={17} />
                </button>
            ) : null}
            {text.length >= 2 && (results.length > 0 || status) && (
                <div className="search-results">
                    {results.map((p) => (
                        <button key={p.id} onClick={() => select(p)}>
                            <MapPin size={15} />
                            {p.name}
                            <ArrowUpRight size={14} />
                        </button>
                    ))}
                    {status && (
                        <p>
                            {status === "error"
                                ? t(
                                      "Søk utilgjengelig. Prøv igjen.",
                                      "Search unavailable. Please try again.",
                                  )
                                : t(
                                      "Ingen treff i Oslo-området.",
                                      "No matches in the Oslo area.",
                                  )}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function RouteDetail() {
    const t = useText(),
        id = useStore(selectedLine),
        data = useStore(transitData),
        prefs = useStore(transitPrefs),
        map = useStore(leafletMapContext),
        [showStops, setShowStops] = useState(false);
    const line = data?.lines.find((l) => l.id === id);
    useEffect(() => setShowStops(false), [id]);
    if (!line || !lineVisible(line, prefs)) return null;
    const info = modeInfo[line.mode];
    return (
        <aside className="route-detail">
            <button
                className="route-close icon-button"
                aria-label={t("Lukk linje", "Close line")}
                onClick={() => selectedLine.set(null)}
            >
                <X size={17} />
            </button>
            <div className="route-label">
                <span
                    className="line-badge"
                    style={routeBadgeStyle(line.color)}
                >
                    {line.code}
                </span>
                <span>{t(info.nb, info.en)}</span>
            </div>
            <h2>{line.name}</h2>
            <p className="small muted">
                {line.stopIds.length}{" "}
                {t("holdeplasser i kartområdet", "stops in the map area")}
            </p>
            <div className="inline-actions">
                <button
                    onClick={() =>
                        map?.fitBounds(L.geoJSON(line.geometry).getBounds(), {
                            padding: [45, 45],
                        })
                    }
                >
                    {t("Se hele linjen", "Fit route")} ↗
                </button>
                <button onClick={() => setShowStops(!showStops)}>
                    {t("Holdeplasser", "Stops")} <ChevronDown size={13} />
                </button>
            </div>
            {showStops && (
                <ul className="route-stops">
                    {line.stopIds
                        .map((id) => data?.stops.find((s) => s.id === id))
                        .filter(Boolean)
                        .map((s) => (
                            <li key={s!.id}>
                                <button
                                    onClick={() =>
                                        map?.setView([s!.lat, s!.lng], 16)
                                    }
                                >
                                    <span />
                                    {s!.name}
                                </button>
                            </li>
                        ))}
                </ul>
            )}
        </aside>
    );
}

function OsloShell() {
    useState(() => {
        const invited = new URLSearchParams(location.search).get("room");
        if (invited && credentials.get() && invited !== credentials.get()!.code)
            leaveRoom();
        if (!polyGeoJSON.get()) polyGeoJSON.set(osloBounds);
        mapGeoJSON.set(polyGeoJSON.get());
        hiderMode.set(false);
        multiplayerActive.set(true);
        return true;
    });
    const currentRoom = useStore(room);
    const qs = currentRoom?.game.questions || [];
    const t = useText(),
        lang = useStore(language),
        map = useStore(leafletMapContext),
        prefs = useStore(transitPrefs);
    const [tab, setTab] = useState<"network" | "game">(
            new URLSearchParams(location.search).has("room") ||
                location.hash === "#game"
                ? "game"
                : "network",
        ),
        [collapsed, setCollapsed] = useState(false),
        [help, setHelp] = useState(false);
    useEffect(() => {
        loadTransit();
        multiplayerActive.set(true);
        if ("serviceWorker" in navigator)
            void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, []);
    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);
    const helpRef = useModalFocus<HTMLElement>(help, () => setHelp(false));
    const credential = useStore(credentials);
    useEffect(() => connectRoom(), [credential?.code, credential?.token]);
    const locate = () => {
        if (!navigator.geolocation) {
            toast.error(
                t("Posisjon er ikke tilgjengelig", "Location is unavailable"),
            );
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (p) => {
                map?.setView([p.coords.latitude, p.coords.longitude], 15);
                const el = document.createElement("strong");
                el.textContent = t("Du er her", "You are here");
                L.popup()
                    .setLatLng([p.coords.latitude, p.coords.longitude])
                    .setContent(el)
                    .openOn(map!);
            },
            () =>
                toast.error(
                    t(
                        "Kunne ikke hente posisjonen din. Sjekk nettlesertillatelsene.",
                        "Could not get your location. Check browser permissions.",
                    ),
                ),
            { timeout: 15000, maximumAge: 30000 },
        );
    };

    return (
        <div className={`oslo-app ${collapsed ? "panel-collapsed" : ""}`}>
            <a className="skip-link" href="#explore-panel">
                {t("Hopp til verktøy", "Skip to tools")}
            </a>
            <aside className="explore-panel" id="explore-panel">
                <header className="brand">
                    <span className="brand-mark">
                        <MapPin size={27} strokeWidth={2.7} />
                    </span>
                    <div>
                        hide<span className="brand-amp">&</span>seek
                        <span className="brand-city">
                            Oslo <span>↗</span>
                        </span>
                    </div>
                    <button
                        className="language-button"
                        aria-label={t(
                            "Bytt til engelsk",
                            "Switch to Norwegian",
                        )}
                        onClick={() =>
                            language.set(lang === "nb" ? "en" : "nb")
                        }
                    >
                        {lang === "nb" ? "English" : "Norsk"}
                    </button>
                </header>
                <button
                    className="mobile-handle"
                    aria-label={
                        collapsed
                            ? t("Åpne panel", "Open panel")
                            : t("Minimer panel", "Collapse panel")
                    }
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <span />
                </button>
                <nav
                    className="panel-tabs"
                    aria-label={t("Spillverktøy", "Game tools")}
                >
                    <button
                        aria-current={tab === "network" ? "page" : undefined}
                        className={tab === "network" ? "selected" : ""}
                        onClick={() => {
                            setTab("network");
                            setCollapsed(false);
                        }}
                    >
                        <Route size={17} />
                        {t("Utforsk", "Explore")}
                    </button>
                    <button
                        aria-current={tab === "game" ? "page" : undefined}
                        className={tab === "game" ? "selected" : ""}
                        onClick={() => {
                            setTab("game");
                            setCollapsed(false);
                        }}
                    >
                        <Target size={17} />
                        {t("Spillet", "The game")}
                        {qs.length > 0 && (
                            <span className="tab-count">{qs.length}</span>
                        )}
                    </button>
                </nav>
                <div className="panel-scroll">
                    {tab === "network" ? <NetworkPanel /> : <RoomPanel />}
                </div>
            </aside>
            <main className="map-stage">
                <div className="map-canvas">
                    <Map />
                    <TransitLayers />
                    <RoomMap />
                </div>
                <div className="map-topbar">
                    <div className="location-pill">
                        <span className="status-dot" />
                        Oslo <span className="pill-divider" />
                        59.91° N
                    </div>
                    <PlaceSearch />
                    <button
                        className="map-help"
                        aria-label={t("Slik spiller du", "How to play")}
                        onClick={() => setHelp(true)}
                    >
                        <CircleHelp size={20} />
                    </button>
                </div>

                <div className="map-navigation">
                    <button
                        aria-label={t("Zoom inn", "Zoom in")}
                        onClick={() => map?.zoomIn()}
                    >
                        <Plus size={20} />
                    </button>
                    <button
                        aria-label={t("Zoom ut", "Zoom out")}
                        onClick={() => map?.zoomOut()}
                    >
                        <span className="minus" />
                    </button>
                    <span />
                    <button
                        aria-label={t("Min posisjon", "My location")}
                        onClick={locate}
                    >
                        <LocateFixed size={20} />
                    </button>
                    <button
                        aria-label={t("Tilbake til Oslo", "Reset to Oslo")}
                        onClick={() => map?.setView([59.9139, 10.7522], 12)}
                    >
                        <Compass size={21} />
                    </button>
                </div>
                <RouteDetail />
                <div className="map-bottom">
                    <div className="map-legend">
                        <span className="legend-title">
                            {t("På kartet", "On the map")}
                        </span>
                        <div>
                            {modes
                                .filter((m) => prefs.modes[m])
                                .map((m) => (
                                    <span key={m}>
                                        <i
                                            style={{
                                                background: modeInfo[m].color,
                                            }}
                                        />
                                        {t(modeInfo[m].nb, modeInfo[m].en)}
                                    </span>
                                ))}
                        </div>
                        <div className="area-legend">
                            <span>
                                <i className="remaining-swatch" />
                                {t("Spilleområde", "Playing area")}
                            </span>
                            <span>
                                <i className="excluded-swatch" />
                                {t("Utelukket", "Excluded")}
                            </span>
                        </div>
                    </div>
                    <button
                        className="game-status"
                        onClick={() => {
                            setTab("game");
                            setCollapsed(false);
                        }}
                    >
                        <span className="status-icon">
                            <Target size={21} />
                        </span>
                        <span>
                            <strong>
                                {currentRoom
                                    ? currentRoom.game.name
                                    : t(
                                          "Opprett eller bli med",
                                          "Create or join",
                                      )}
                            </strong>
                            <small>
                                {qs.length}{" "}
                                {t(
                                    "spørsmål · Åpne spill",
                                    "questions · Open game",
                                )}
                            </small>
                        </span>
                        <ArrowUpRight size={18} />
                    </button>
                </div>
            </main>
            {help && (
                <div className="modal-scrim" onClick={() => setHelp(false)}>
                    <section
                        ref={helpRef}
                        className="help-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="help-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            autoFocus
                            className="route-close icon-button"
                            aria-label={t("Lukk", "Close")}
                            onClick={() => setHelp(false)}
                        >
                            <X />
                        </button>

                        <h2 id="help-title">{t("Om appen", "About")}</h2>
                        <p>
                            {t(
                                "Opprett et spill og del invitasjonen. Bruk den fysiske boka for nøyaktige spørsmålsregler.",
                                "Create a game and share the invitation. Use the physical book for exact question rules.",
                            )}
                        </p>
                        <p>
                            {t(
                                "Spill synkroniseres mellom enheter. Gjemmelagets posisjon deles aldri.",
                                "Games sync across devices. The hiding team’s location is never shared.",
                            )}
                        </p>
                        <p>
                            {t(
                                "Et uoffisielt fanverktøy inspirert av Jet Lag: The Game.",
                                "An unofficial fan companion inspired by Jet Lag: The Game.",
                            )}
                        </p>
                        <a
                            href="https://github.com/taibeled/JetLagHideAndSeek"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t(
                                "Basert på taibeled/JetLagHideAndSeek · MIT-lisens",
                                "Based on taibeled/JetLagHideAndSeek · MIT license",
                            )}
                        </a>
                        <a
                            href="https://github.com/Eljard/hidenseek-oslo"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t("Se kildekoden", "View source code")} ↗
                        </a>
                    </section>
                </div>
            )}
        </div>
    );
}

export function OsloApp() {
    return <OsloShell />;
}
