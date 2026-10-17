import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as L from "leaflet";
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowUpRight,
    BusFront,
    Check,
    ChevronDown,
    ChevronRight,
    CircleHelp,
    Compass,
    Flag,
    Layers,
    LocateFixed,
    MapPin,
    Plus,
    Radio,
    Redo2,
    Route,
    Search,
    SlidersHorizontal,
    Sparkles,
    Target,
    TrainFront,
    TramFront,
    Trash2,
    Undo2,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import { Map } from "@/components/Map";
import {
    MatchingQuestionComponent,
    MeasuringQuestionComponent,
    TentacleQuestionComponent,
} from "@/components/QuestionCards";
import {
    SidebarContext as ZoneContext,
    SidebarProvider as ZoneProvider,
} from "@/components/ui/sidebar-r";
import { ZoneSidebar } from "@/components/ZoneSidebar";
import {
    addQuestion,
    calculationError,
    drawingQuestionKey,
    hiderMode,
    isLoading,
    leafletMapContext,
    mapGeoJSON,
    polyGeoJSON,
    questionFinishedMapData,
    questionModified,
    questions,
} from "@/lib/context";
import { holedMask } from "@/maps";
import type { Question } from "@/maps/schema";

import { useText } from "./i18n";
import {
    applySession,
    exportSession,
    historyState,
    language,
    lineVisible,
    loadTransit,
    type Mode,
    osloBounds,
    parseSession,
    selectedLine,
    startHistory,
    stepHistory,
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
        color: "#df7924",
        tag: "T",
    },
    tram: {
        nb: "Trikk",
        en: "Tram",
        icon: TramFront,
        color: "#228bb0",
        tag: "TR",
    },
    bus: { nb: "Buss", en: "Bus", icon: BusFront, color: "#c74756", tag: "B" },
    rail: {
        nb: "Tog",
        en: "Train",
        icon: TrainFront,
        color: "#34865c",
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
            <div className="section-eyebrow">
                <span className="status-dot" />
                {t("DITT NESTE TREKK", "YOUR NEXT MOVE")}
            </div>
            <h1>
                {t("Hele byen.", "The whole city.")}
                <br />
                <span>{t("Ett stort spill.", "One big game.")}</span>
            </h1>
            <p className="intro">
                {t(
                    "Følg linjene. Finn nye spor. Gjør Oslo til spillebrettet ditt.",
                    "Follow the lines. Find your next clue. Make Oslo your playing field.",
                )}
            </p>
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
            <div className="tip-card">
                <Compass size={23} />
                <div>
                    <strong>
                        {t("Et lite forsprang", "A little head start")}
                    </strong>
                    <p>
                        {t(
                            "Trykk på en linje for å utforske ruten og holdeplassene.",
                            "Tap a line to explore its route and stops.",
                        )}
                    </p>
                </div>
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
                <p className="data-note">
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
                </p>
            )}
        </>
    );
}

const questionInfo = {
    radius: {
        nb: "Radius",
        en: "Radius",
        icon: Target,
        description: [
            "Er gjemmestedet innenfor en avstand?",
            "Is the hiding spot within a distance?",
        ],
    },
    thermometer: {
        nb: "Varmere / kaldere",
        en: "Warmer / colder",
        icon: Radio,
        description: [
            "Kom du nærmere mellom to punkter?",
            "Did you get closer between two points?",
        ],
    },
    matching: {
        nb: "Sammenligning",
        en: "Matching",
        icon: Layers,
        description: [
            "Har dere samme nærmeste sted eller område?",
            "Do you share a nearest place or area?",
        ],
    },
    measuring: {
        nb: "Avstand",
        en: "Measuring",
        icon: Route,
        description: [
            "Hvem er nærmest et bestemt sted?",
            "Who is closer to a particular place?",
        ],
    },
    tentacles: {
        nb: "Tentakler",
        en: "Tentacles",
        icon: Compass,
        description: [
            "Hvilket sted er nærmest gjemmestedet?",
            "Which place is closest to the hiding spot?",
        ],
    },
};
function BasicEditor({ question }: { question: Question }) {
    const t = useText(),
        busy = useStore(isLoading);
    const change = (key: string, value: unknown) => {
        Object.assign(question.data, { [key]: value });
        questionModified();
    };
    const coord = (key: string, label: string, min: number, max: number) => (
        <label className="field" key={key}>
            {label}
            <input
                aria-label={label}
                type="number"
                min={min}
                max={max}
                step="any"
                value={Number((question.data as any)[key])}
                disabled={busy}
                onChange={(e) => {
                    if (e.target.value !== "" && e.target.validity.valid)
                        change(key, Number(e.target.value));
                }}
            />
        </label>
    );
    if (question.id === "radius")
        return (
            <fieldset disabled={busy}>
                <div className="two-fields">
                    <label className="field">
                        {t("Radius (km)", "Radius (km)")}
                        <input
                            type="number"
                            min="0"
                            max="1000"
                            step="any"
                            value={Number(
                                turf
                                    .convertLength(
                                        question.data.radius,
                                        question.data.unit,
                                        "kilometers",
                                    )
                                    .toFixed(3),
                            )}
                            onChange={(e) => {
                                if (
                                    e.target.value !== "" &&
                                    e.target.validity.valid
                                ) {
                                    Object.assign(question.data, {
                                        radius: Number(e.target.value),
                                        unit: "kilometers",
                                    });
                                    questionModified();
                                }
                            }}
                        />
                    </label>
                    <label className="field">
                        {t("Svar", "Answer")}
                        <select
                            value={question.data.within ? "yes" : "no"}
                            onChange={(e) =>
                                change("within", e.target.value === "yes")
                            }
                        >
                            <option value="yes">
                                {t("Innenfor", "Inside")}
                            </option>
                            <option value="no">
                                {t("Utenfor", "Outside")}
                            </option>
                        </select>
                    </label>
                </div>
                <div className="two-fields">
                    {coord("lat", t("Breddegrad", "Latitude"), -90, 90)}
                    {coord("lng", t("Lengdegrad", "Longitude"), -180, 180)}
                </div>
            </fieldset>
        );
    if (question.id === "thermometer")
        return (
            <fieldset disabled={busy}>
                <p className="small muted">
                    {t("Fra punkt A til punkt B:", "From point A to point B:")}
                </p>
                <div className="two-fields">
                    {coord(
                        "latA",
                        "A · " + t("breddegrad", "latitude"),
                        -90,
                        90,
                    )}
                    {coord(
                        "lngA",
                        "A · " + t("lengdegrad", "longitude"),
                        -180,
                        180,
                    )}
                    {coord(
                        "latB",
                        "B · " + t("breddegrad", "latitude"),
                        -90,
                        90,
                    )}
                    {coord(
                        "lngB",
                        "B · " + t("lengdegrad", "longitude"),
                        -180,
                        180,
                    )}
                </div>
                <label className="field">
                    {t("Svar", "Answer")}
                    <select
                        value={question.data.warmer ? "yes" : "no"}
                        onChange={(e) =>
                            change("warmer", e.target.value === "yes")
                        }
                    >
                        <option value="yes">
                            {t(
                                "Varmere — B er nærmere",
                                "Warmer — B is closer",
                            )}
                        </option>
                        <option value="no">
                            {t(
                                "Kaldere — A er nærmere",
                                "Colder — A is closer",
                            )}
                        </option>
                    </select>
                </label>
            </fieldset>
        );
    const Editor =
        question.id === "matching"
            ? MatchingQuestionComponent
            : question.id === "measuring"
              ? MeasuringQuestionComponent
              : TentacleQuestionComponent;
    return (
        <div className="legacy-editor">
            <Editor data={question.data as any} questionKey={question.key} />
        </div>
    );
}

function GamePanel() {
    const t = useText(),
        qs = useStore(questions),
        busy = useStore(isLoading),
        history = useStore(historyState),
        map = useStore(leafletMapContext),
        boundary = useStore(polyGeoJSON);
    const [editing, setEditing] = useState<number | null>(null),
        [confirm, setConfirm] = useState<"clear" | "preset" | null>(null),
        [setup, setSetup] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const confirmationRef = useModalFocus<HTMLDivElement>(
        confirm !== null,
        () => setConfirm(null),
    );
    const add = (id: keyof typeof questionInfo) => {
        if (!map || busy) return;
        const c = map.getCenter();
        const data =
            id === "thermometer"
                ? {
                      latA: c.lat,
                      lngA: c.lng,
                      latB: c.lat + 0.01,
                      lngB: c.lng + 0.025,
                  }
                : id === "radius"
                  ? { lat: c.lat, lng: c.lng, radius: 2, unit: "kilometers" }
                  : { lat: c.lat, lng: c.lng };
        addQuestion({ id, data } as any);
        setEditing(questions.get().at(-1)!.key);
    };
    const download = () => {
        const url = URL.createObjectURL(
            new Blob([JSON.stringify(exportSession(), null, 2)], {
                type: "application/json",
            }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "hide-seek-oslo.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const importFile = async (file?: File) => {
        if (!file) return;
        try {
            if (file.size > 5_000_000) throw Error();
            const session = parseSession(await file.text());
            if (
                qs.length &&
                !window.confirm(
                    t(
                        "Erstatte spillet med filen?",
                        "Replace the current game with this file?",
                    ),
                )
            )
                return;
            applySession(session);
            setEditing(null);
            toast.success(t("Spillet er importert", "Game imported"));
        } catch {
            toast.error(
                t(
                    "Ugyldig spillfil. Spillet ditt er beholdt.",
                    "Invalid game file. Your game was kept.",
                ),
            );
        } finally {
            if (input.current) input.current.value = "";
        }
    };
    return (
        <>
            <div className="section-eyebrow">
                <span className="status-dot" />
                {t("JAKTEN ER I GANG", "THE HUNT IS ON")}
            </div>
            <h1>
                {t("Neste spor?", "Next clue?")}
                <br />
                <span>{t("Det er din tur.", "Your move.")}</span>
            </h1>
            <p className="intro">
                {t(
                    "Still et spørsmål. Legg inn svaret. Snevre inn gjemmestedet.",
                    "Ask a question. Add the answer. Narrow down the hiding spot.",
                )}
            </p>
            <button
                className="boundary-button"
                aria-expanded={setup}
                onClick={() => setSetup(!setup)}
            >
                <span className="mode-icon">
                    <Flag size={18} />
                </span>
                <span>
                    <strong>{t("Spilleområde", "Playing area")}</strong>
                    <small>
                        {boundary?.features[0]?.properties?.name ||
                            t("Egendefinert område", "Custom area")}
                    </small>
                </span>
                <ChevronDown size={17} />
            </button>
            {setup && (
                <div className="setup-box">
                    <p className="small">
                        {t(
                            "Oslo-presetet dekker byområdet. Bruk polygonverktøyet nederst til venstre på kartet for å tegne et nytt område. Et nytt område starter en ny spørsmålsrekke.",
                            "The Oslo preset covers the urban area. Use the polygon tool at the lower left of the map to draw a new area. A new area starts a new question history.",
                        )}
                    </p>
                    <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => setConfirm("preset")}
                    >
                        {t("Bruk Oslo-preset", "Use Oslo preset")}
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => {
                            const button =
                                document.querySelector<HTMLAnchorElement>(
                                    ".leaflet-draw-draw-polygon",
                                );
                            button?.click();
                        }}
                    >
                        {t("Tegn nytt område", "Draw new area")}{" "}
                        <ArrowUpRight size={14} />
                    </button>
                </div>
            )}
            <div className="panel-heading">
                <h2>{t("Legg til et spørsmål", "Add a question")}</h2>
                <Plus size={17} />
            </div>
            <div className="question-types">
                {Object.entries(questionInfo).map(([id, info]) => (
                    <button
                        disabled={busy || !map}
                        key={id}
                        onClick={() => add(id as keyof typeof questionInfo)}
                    >
                        <info.icon size={20} />
                        <span>{t(info.nb, info.en)}</span>
                        <Plus size={14} />
                    </button>
                ))}
            </div>
            <div className="panel-heading history-heading">
                <h2>
                    {t("Sporene dine", "Your clues")}{" "}
                    <span className="count-badge">{qs.length}</span>
                </h2>
                <div className="history-actions">
                    <button
                        aria-label={t("Angre", "Undo")}
                        disabled={!history.undo || busy}
                        onClick={() => stepHistory("undo")}
                    >
                        <Undo2 size={17} />
                    </button>
                    <button
                        aria-label={t("Gjør om", "Redo")}
                        disabled={!history.redo || busy}
                        onClick={() => stepHistory("redo")}
                    >
                        <Redo2 size={17} />
                    </button>
                </div>
            </div>
            {!qs.length ? (
                <div className="empty-state">
                    <span className="empty-orbit">
                        <MapPin size={27} />
                    </span>
                    <strong>
                        {t(
                            "Alle muligheter er åpne",
                            "Every possibility is open",
                        )}
                    </strong>
                    <p>
                        {t(
                            "Det første spørsmålet setter jakten i gang.",
                            "Your first question gets the hunt going.",
                        )}
                    </p>
                </div>
            ) : (
                <ol className="clue-list">
                    {qs.map((q, i) => {
                        const info = questionInfo[q.id];
                        return (
                            <li
                                key={q.key}
                                className={
                                    editing === q.key
                                        ? "clue-card active"
                                        : "clue-card"
                                }
                            >
                                <div className="clue-header">
                                    <span className="clue-number">
                                        {String(i + 1).padStart(2, "0")}
                                    </span>
                                    <button
                                        className="clue-title"
                                        aria-expanded={editing === q.key}
                                        onClick={() =>
                                            setEditing(
                                                editing === q.key
                                                    ? null
                                                    : q.key,
                                            )
                                        }
                                    >
                                        <strong>{t(info.nb, info.en)}</strong>
                                        <small>
                                            {t(
                                                info.description[0],
                                                info.description[1],
                                            )}
                                        </small>
                                    </button>
                                    <button
                                        className="icon-button"
                                        aria-label={t(
                                            "Slett spørsmål",
                                            "Delete question",
                                        )}
                                        disabled={busy}
                                        onClick={() =>
                                            questions.set(
                                                qs.filter(
                                                    (x) => x.key !== q.key,
                                                ),
                                            )
                                        }
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                                {editing === q.key && (
                                    <BasicEditor question={q} />
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
            <p className="saved-note">
                <Check size={14} />
                {busy
                    ? t(
                          "Beregner mulige gjemmesteder…",
                          "Calculating possible hiding spots…",
                      )
                    : t(
                          "Lagres automatisk på denne enheten",
                          "Automatically saved on this device",
                      )}
            </p>
            <button
                className="zones-button secondary-button"
                onClick={() => ZoneContext.get().toggleSidebar()}
            >
                <Layers size={15} />
                {t("Avanserte gjemmeområder", "Advanced hiding zones")}{" "}
                <ArrowUpRight size={14} />
            </button>
            <div className="session-actions">
                <button onClick={download}>
                    <ArrowDownToLine size={16} />
                    {t("Eksporter", "Export")}
                </button>
                <button onClick={() => input.current?.click()} disabled={busy}>
                    <ArrowUpFromLine size={16} />
                    {t("Importer", "Import")}
                </button>
                <button
                    className="danger"
                    disabled={!qs.length || busy}
                    onClick={() => setConfirm("clear")}
                    aria-label={t("Tøm spillet", "Clear game")}
                >
                    <Trash2 size={16} />
                </button>
                <input
                    ref={input}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => importFile(e.target.files?.[0])}
                />
            </div>
            {confirm && (
                <div
                    ref={confirmationRef}
                    className="confirmation"
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={t("Starte på nytt?", "Start again?")}
                >
                    <strong>{t("Starte på nytt?", "Start again?")}</strong>
                    <p>
                        {t(
                            "Spørsmålene fjernes. Du kan angre etterpå.",
                            "Questions will be cleared. You can undo afterwards.",
                        )}
                    </p>
                    <div>
                        <button
                            autoFocus
                            className="secondary-button"
                            onClick={() => setConfirm(null)}
                        >
                            {t("Avbryt", "Cancel")}
                        </button>
                        <button
                            className="primary-button"
                            onClick={() => {
                                if (confirm === "preset")
                                    applySession(
                                        parseSession(
                                            JSON.stringify({
                                                version: 1,
                                                questions: [],
                                                boundary: osloBounds,
                                            }),
                                        ),
                                    );
                                else questions.set([]);
                                drawingQuestionKey.set(-1);
                                setEditing(null);
                                setConfirm(null);
                            }}
                        >
                            {t("Start på nytt", "Start again")}
                        </button>
                    </div>
                </div>
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
                    "Hvor går jakten videre?",
                    "Where does the hunt go next?",
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
            ) : (
                <kbd>OSLO</kbd>
            )}
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
        if (!polyGeoJSON.get()) polyGeoJSON.set(osloBounds);
        mapGeoJSON.set(polyGeoJSON.get());
        hiderMode.set(false);
        return true;
    });
    const failed = useStore(calculationError);
    const t = useText(),
        lang = useStore(language),
        qs = useStore(questions),
        map = useStore(leafletMapContext),
        busy = useStore(isLoading),
        prefs = useStore(transitPrefs),
        finished = useStore(questionFinishedMapData);
    const [tab, setTab] = useState<"network" | "game">("network"),
        [collapsed, setCollapsed] = useState(false),
        [help, setHelp] = useState(false);
    useEffect(() => {
        loadTransit();
        return startHistory();
    }, []);
    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);
    const helpRef = useModalFocus<HTMLElement>(help, () => setHelp(false));
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
    const remaining = (() => {
        if (!finished || !qs.length) return null;
        try {
            const possible = holedMask(finished);
            return possible ? turf.area(possible) / 1e6 : 0;
        } catch {
            return null;
        }
    })();
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
                            OSLO EDITION <span>↗</span>
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
                        {lang === "nb" ? "EN" : "NO"}
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
                    {tab === "network" ? <NetworkPanel /> : <GamePanel />}
                </div>
                <footer className="panel-footer">
                    <span>
                        <MapPin size={13} />{" "}
                        {t(
                            "Laget for små og store omveier",
                            "Made for little detours",
                        )}
                    </span>
                    <button
                        aria-label={t(
                            "Hjelp og kreditering",
                            "Help and credits",
                        )}
                        onClick={() => setHelp(true)}
                    >
                        <CircleHelp size={17} />
                    </button>
                </footer>
            </aside>
            <main className="map-stage">
                <div className="map-canvas">
                    <Map />
                    <TransitLayers />
                </div>
                <div className="map-topbar">
                    <div className="location-pill">
                        <span className="status-dot" />
                        OSLO, NORGE <span className="pill-divider" />
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
                <div className="map-heading">
                    <span className="map-kicker">
                        {t(
                            "BYEN ER SPILLEBRETTET",
                            "THE CITY IS YOUR PLAYING FIELD",
                        )}
                    </span>
                    <p>
                        {t("Ta en omvei.", "Take a detour.")}{" "}
                        <Sparkles size={17} />
                    </p>
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
                            {t("PÅ KARTET", "ON THE MAP")}
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
                                {t("Mulig gjemmested", "Possible hiding area")}
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
                                {failed
                                    ? t(
                                          "Beregningen feilet",
                                          "Calculation failed",
                                      )
                                    : busy
                                      ? t("Kartet tenker…", "Thinking…")
                                      : remaining !== null
                                        ? `${remaining.toFixed(1)} km² ${t("gjenstår", "remaining")}`
                                        : t(
                                              "Jakten starter med deg",
                                              "The hunt starts with you",
                                          )}
                            </strong>
                            <small>
                                {qs.length}{" "}
                                {t(
                                    "spørsmål stilt · Åpne spillet",
                                    "questions asked · Open the game",
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
                        <span className="section-eyebrow">
                            HIDE & SEEK OSLO
                        </span>
                        <h2 id="help-title">
                            {t(
                                "Byen er full av muligheter.",
                                "The city is full of possibilities.",
                            )}
                        </h2>
                        <p>
                            {t(
                                "Utforsk kollektivnettet, og åpne Spillet for å velge område og legge til spørsmål. Svarene snevrer inn mulige gjemmesteder. Bruk kartets tegneverktøy for egne grenser.",
                                "Explore the transit network, then open The game to choose an area and add questions. Answers narrow down possible hiding spots. Use the drawing tool for custom boundaries.",
                            )}
                        </p>
                        <p>
                            {t(
                                "Spillet lagres lokalt. Eksport inkluderer spørsmål og grenser, aldri en separat privat hider-posisjon. Avanserte spørsmål bruker åpne karttjenester og trenger nett.",
                                "Your game is saved locally. Exports include questions and boundaries, never a separate private hider position. Advanced questions use open map services and need internet.",
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
    return (
        <ZoneProvider defaultOpen={false}>
            <OsloShell />
            <ZoneSidebar />
        </ZoneProvider>
    );
}
