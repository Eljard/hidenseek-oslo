import { useStore } from "@nanostores/react";
import {
    Bell,
    BellOff,
    Check,
    Copy,
    LogOut,
    MapPin,
    Pause,
    Play,
    Plus,
    Trash2,
    Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useText } from "@/oslo/i18n";
import { language, osloBounds } from "@/oslo/state";

import { catalog, type Category, categoryLabels } from "./catalog";
import {
    action,
    actionBusy,
    api,
    clock,
    connection,
    createRoom,
    credentials,
    disableNotifications,
    enableNotifications,
    joinRoom,
    labelEvent,
    leaveRoom,
    mapDraft,
    mapTool,
    message,
    notifications,
    pickedPoint,
    room,
    roomError,
} from "./client";
import { phaseAt, scoreAt } from "./engine";
import type { Asked, Game, RoomView } from "./model";
import { LocationSharing } from "./RoomMap";

function useNow() {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const i = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(i);
    }, []);
    return now;
}
export function RoomPanel() {
    const current = useStore(room),
        c = useStore(credentials),
        status = useStore(connection);
    const t = useText();
    if (!current && c)
        return (
            <section className="room-entry">
                <h1>{t("Spill", "Game")}</h1>
                <p role="status">
                    {status === "offline"
                        ? t("Ingen forbindelse.", "No connection.")
                        : t("Kobler til…", "Connecting…")}
                </p>
                <button className="secondary-button" onClick={leaveRoom}>
                    {t("Tilbake", "Back")}
                </button>
            </section>
        );
    return current ? <ActiveRoom value={current} /> : <RoomEntry />;
}
function RoomEntry() {
    const t = useText();
    const [mode, setMode] = useState<"create" | "join">(
        new URLSearchParams(location.search).has("room") ? "join" : "create",
    );
    const [name, setName] = useState(""),
        [title, setTitle] = useState("Oslo"),
        [teams, setTeams] = useState("Lag 1\nLag 2"),
        [code, setCode] = useState(
            new URLSearchParams(location.search).get("room") || "",
        ),
        [preview, setPreview] = useState<{
            name: string;
            teams: { id: string; name: string }[];
        } | null>(null),
        [team, setTeam] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            if (mode === "create")
                await createRoom({
                    name: title,
                    player: name,
                    teams: teams
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    hideMinutes: 30,
                });
            else if (!preview) {
                const v = await api(
                    `/api/rooms/${code.trim().toLowerCase()}/lookup`,
                    undefined,
                    null,
                );
                setPreview(v);
                setTeam(v.teams[0].id);
            } else await joinRoom(code.trim().toLowerCase(), name, team);
        } catch (e) {
            setError(message((e as Error).message));
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="room-entry">
            <h1>{t("Spill", "Game")}</h1>
            <div className="room-subtabs">
                <button
                    aria-pressed={mode === "create"}
                    onClick={() => {
                        setMode("create");
                        setError("");
                    }}
                >
                    {t("Opprett", "Create")}
                </button>
                <button
                    aria-pressed={mode === "join"}
                    onClick={() => {
                        setMode("join");
                        setError("");
                    }}
                >
                    {t("Bli med", "Join")}
                </button>
            </div>
            <form onSubmit={submit}>
                {mode === "create" ? (
                    <>
                        <label className="field">
                            {t("Spillnavn", "Game name")}
                            <input
                                value={title}
                                maxLength={80}
                                required
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            {t("Lag · ett per linje", "Teams · one per line")}
                            <textarea
                                value={teams}
                                required
                                rows={3}
                                onChange={(e) => setTeams(e.target.value)}
                            />
                        </label>
                    </>
                ) : (
                    <label className="field">
                        {t("Spillkode", "Game code")}
                        <input
                            value={code}
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={10}
                            minLength={10}
                            required
                            onChange={(e) => {
                                setCode(
                                    e.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z2-9]/g, ""),
                                );
                                setPreview(null);
                            }}
                        />
                    </label>
                )}
                {(mode === "create" || preview) && (
                    <label className="field">
                        {t("Navnet ditt", "Your name")}
                        <input
                            value={name}
                            maxLength={40}
                            required
                            autoComplete="nickname"
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                )}
                {mode === "join" && preview && (
                    <>
                        <p className="room-name">{preview.name}</p>
                        <label className="field">
                            {t("Ditt lag", "Your team")}
                            <select
                                value={team}
                                onChange={(e) => setTeam(e.target.value)}
                            >
                                {preview.teams.map((team) => (
                                    <option key={team.id} value={team.id}>
                                        {team.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                )}
                {error && (
                    <p className="room-error" role="alert">
                        {error}
                    </p>
                )}
                <button className="primary-button full" disabled={busy}>
                    {busy
                        ? t("Vent…", "Please wait…")
                        : mode === "create"
                          ? t("Opprett spill", "Create game")
                          : preview
                            ? t("Bli med", "Join")
                            : t("Finn spill", "Find game")}
                </button>
            </form>
            <p className="room-footnote">
                {t(
                    "2–50 lag. Første lag gjemmer seg.",
                    "2–50 teams. The first team hides.",
                )}
            </p>
        </section>
    );
}
function ActiveRoom({ value }: { value: RoomView }) {
    const t = useText(),
        busy = useStore(actionBusy),
        status = useStore(connection),
        error = useStore(roomError),
        enabled = useStore(notifications),
        now = useNow();
    const [tab, setTab] = useState<"questions" | "hand" | "scores" | "setup">(
            value.game.phase === "lobby" && value.me.host
                ? "setup"
                : "questions",
        ),
        [notificationError, setNotificationError] = useState(""),
        [copied, setCopied] = useState(false),
        [bonus, setBonus] = useState(0);
    const [offset, setOffset] = useState(value.serverNow - Date.now());
    useEffect(() => setOffset(value.serverNow - Date.now()), [value.serverNow]);
    useEffect(() => {
        if (!value.me.hider && tab === "hand") setTab("questions");
    }, [value.me.hider, tab]);
    const serverNow = now + offset,
        g = value.game,
        phase = phaseAt(g as Game, serverNow),
        active = ["seeking", "endgame"].includes(phase) && !g.pausedAt;
    const phaseName = {
        lobby: t("Oppsett", "Setup"),
        hiding: t("Gjemmetid", "Hiding"),
        seeking: t("Leting", "Seeking"),
        endgame: t("Sluttspill", "Endgame"),
        finished: t("Runden er ferdig", "Round finished"),
    }[phase];
    const team = g.teams.find((x) => x.id === value.me.team)!,
        hiding = g.teams.find((x) => x.id === g.hider)!;
    const toggleNotifications = async () => {
        setNotificationError("");
        try {
            if (enabled) await disableNotifications();
            else await enableNotifications();
        } catch (e) {
            const code = (e as Error).message;
            setNotificationError(
                code === "unsupported"
                    ? t(
                          "På iPhone: legg appen til på Hjem-skjermen.",
                          "On iPhone: add the app to your Home Screen.",
                      )
                    : code === "denied"
                      ? t(
                            "Tillat varsler i nettleserinnstillingene.",
                            "Allow notifications in browser settings.",
                        )
                      : t(
                            "Kunne ikke aktivere varsler. Prøv igjen.",
                            "Could not enable notifications. Try again.",
                        ),
            );
        }
    };
    const share = async () => {
        try {
            await navigator.clipboard.writeText(
                `${location.origin}/?room=${g.code}#game`,
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(
                t("Kopier invitasjonen", "Copy invitation"),
                `${location.origin}/?room=${g.code}#game`,
            );
        }
    };
    return (
        <section className="active-room">
            <div className="room-heading">
                <h1>{g.name}</h1>
                <span
                    className={`connection-status ${status}`}
                    title={
                        status === "live"
                            ? t("Tilkoblet", "Connected")
                            : t("Kobler til igjen", "Reconnecting")
                    }
                />
            </div>
            <div className="room-identity">
                <span style={{ borderColor: team.color }}>{team.name}</span>
                <b>
                    {value.me.hider
                        ? t("Gjemmer", "Hider")
                        : t("Leter", "Seeker")}
                    {value.me.host ? " · " + t("Vert", "Host") : ""}
                </b>
            </div>
            <div className="round-clock">
                <span>
                    {t("Runde", "Round")} {g.round} · {phaseName}
                    {g.pausedAt ? " · " + t("Pause", "Paused") : ""}
                </span>
                <strong>
                    {clock(
                        phase === "hiding"
                            ? g.hideEnd - serverNow
                            : scoreAt(g as Game, serverNow),
                    )}
                </strong>
                {phase === "hiding" && (
                    <small>
                        {hiding.name} {t("gjemmer seg", "is hiding")}
                    </small>
                )}
            </div>
            <div className="room-quick-actions">
                <button
                    onClick={share}
                    aria-label={t("Kopier invitasjon", "Copy invitation")}
                >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    <span>{g.code}</span>
                </button>
                <button onClick={toggleNotifications} aria-pressed={enabled}>
                    {enabled ? <Bell size={15} /> : <BellOff size={15} />}
                    <span>{t("Varsler", "Alerts")}</span>
                </button>
                <button
                    aria-label={t("Forlat spillet", "Leave game")}
                    onClick={() => {
                        if (
                            window.confirm(
                                t(
                                    "Forlate spillet på denne enheten?",
                                    "Leave the game on this device?",
                                ),
                            )
                        )
                            leaveRoom();
                    }}
                >
                    <LogOut size={15} />
                </button>
            </div>
            {notificationError && (
                <p className="room-error" role="alert">
                    {notificationError}
                </p>
            )}
            {error && (
                <p className="room-error" role="alert">
                    {error}
                </p>
            )}
            {status !== "live" && (
                <p className="small muted" role="status">
                    {t("Kobler til igjen…", "Reconnecting…")}
                </p>
            )}
            <div className="room-subtabs">
                <button
                    aria-pressed={tab === "questions"}
                    onClick={() => setTab("questions")}
                >
                    {t("Spørsmål", "Questions")}
                </button>
                {value.me.hider && (
                    <button
                        aria-pressed={tab === "hand"}
                        onClick={() => setTab("hand")}
                    >
                        {t("Kort", "Cards")}
                    </button>
                )}
                <button
                    aria-pressed={tab === "scores"}
                    onClick={() => setTab("scores")}
                >
                    {t("Poeng", "Scores")}
                </button>
                <button
                    aria-pressed={tab === "setup"}
                    onClick={() => setTab("setup")}
                >
                    {t("Oppsett", "Setup")}
                </button>
            </div>
            {g.curses.map((c) => (
                <div className="active-curse" key={c.id}>
                    <strong>{c.name}</strong>
                    {c.effect && <p>{c.effect}</p>}
                    <span>
                        {c.until
                            ? clock(c.until - (g.pausedAt || serverNow))
                            : t("Til fullført", "Until completed")}
                        {c.blocks
                            ? " · " +
                              t("Blokkerer spørsmål", "Blocks questions")
                            : ""}
                    </span>
                    <button
                        disabled={!active || busy}
                        onClick={() => {
                            if (
                                window.confirm(
                                    t(
                                        "Er forbannelsen fullført?",
                                        "Has the curse been completed?",
                                    ),
                                )
                            )
                                void action("clearCurse", { curse: c.id });
                        }}
                    >
                        {t("Fullført", "Completed")}
                    </button>
                </div>
            ))}
            {tab === "questions" && (
                <QuestionWorkspace
                    value={value}
                    now={serverNow}
                    active={active}
                />
            )}
            {tab === "hand" && value.me.hider && (
                <Hand value={value} active={active} />
            )}
            {tab === "scores" && <Scoreboard value={value} />}
            {tab === "setup" && <RoomSetup value={value} />}
            <LocationSharing />
            <div className="round-actions">
                {value.me.host && active && (
                    <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void action("pause")}
                    >
                        <Pause size={15} />
                        {t("Pause", "Pause")}
                    </button>
                )}
                {value.me.host && g.pausedAt && (
                    <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void action("resume")}
                    >
                        <Play size={15} />
                        {t("Fortsett", "Resume")}
                    </button>
                )}
                {value.me.hider && phase === "seeking" && (
                    <button
                        className="secondary-button"
                        disabled={!active || busy}
                        onClick={() => {
                            if (
                                window.confirm(
                                    t("Starte sluttspill?", "Declare endgame?"),
                                )
                            )
                                void action("endgame");
                        }}
                    >
                        {t("Sluttspill", "Endgame")}
                    </button>
                )}
            </div>
            {value.me.host && active && (
                <details className="compact-details">
                    <summary>{t("Registrer fangst", "Record catch")}</summary>
                    <label className="field">
                        {t("Ekstra bonusminutter", "Additional bonus minutes")}
                        <input
                            type="number"
                            min={0}
                            max={1440}
                            value={bonus}
                            onChange={(e) => setBonus(Number(e.target.value))}
                        />
                    </label>
                    <button
                        className="primary-button full"
                        disabled={busy}
                        onClick={() => {
                            if (
                                window.confirm(
                                    t(
                                        "Bekrefte at gjemmeren er funnet?",
                                        "Confirm that the hider was caught?",
                                    ),
                                )
                            )
                                void action("catch", { bonus });
                        }}
                    >
                        {t("Bekreft fangst", "Confirm catch")}
                    </button>
                </details>
            )}
            <details className="compact-details">
                <summary>
                    <Users size={14} />
                    {t("Spillere", "Players")} · {value.members.length}
                </summary>
                {value.members.map((m) => (
                    <p className="member-row" key={m.id}>
                        <span>{m.name}</span>
                        <small>
                            {g.teams.find((t) => t.id === m.team)?.name}
                        </small>
                    </p>
                ))}
            </details>
            <details className="compact-details">
                <summary>{t("Hendelser", "Activity")}</summary>
                <ol className="room-activity">
                    {[...g.events].reverse().map((e) => (
                        <li key={e.seq}>
                            <time>
                                {new Date(e.at).toLocaleTimeString(
                                    language.get() === "nb" ? "nb-NO" : "en-GB",
                                    { hour: "2-digit", minute: "2-digit" },
                                )}
                            </time>
                            {labelEvent(e)}
                        </li>
                    ))}
                </ol>
            </details>
        </section>
    );
}

function RoomSetup({ value }: { value: RoomView }) {
    const t = useText(),
        busy = useStore(actionBusy),
        g = value.game,
        between = ["lobby", "finished"].includes(g.phase),
        [hider, setHider] = useState(g.hider),
        [minutes, setMinutes] = useState(g.hideMinutes),
        [tentacles, setTentacles] = useState(g.tentacles),
        [rules, setRules] = useState(g.rules),
        draft = useStore(mapDraft),
        tool = useStore(mapTool);
    useEffect(() => {
        setHider(g.hider);
        setMinutes(g.hideMinutes);
        setTentacles(g.tentacles);
        setRules(g.rules);
    }, [g.hider, g.hideMinutes, g.tentacles, g.rules]);
    return (
        <div className="room-setup">
            <label className="field">
                {t("Ditt lag", "Your team")}
                <select
                    disabled={!between || busy}
                    value={value.me.team}
                    onChange={async (e) => {
                        try {
                            await joinRoom(g.code, "", e.target.value);
                        } catch (e) {
                            roomError.set(message((e as Error).message));
                        }
                    }}
                >
                    {g.teams.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name}
                        </option>
                    ))}
                </select>
            </label>
            {value.me.host ? (
                <>
                    <label className="field">
                        {t("Gjemmelag", "Hiding team")}
                        <select
                            value={hider}
                            disabled={!between || busy}
                            onChange={(e) => setHider(e.target.value)}
                        >
                            {g.teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="field">
                        {t("Gjemmetid · minutter", "Hiding time · minutes")}
                        <input
                            type="number"
                            min={1}
                            max={180}
                            value={minutes}
                            disabled={!between || busy}
                            onChange={(e) => setMinutes(Number(e.target.value))}
                        />
                    </label>
                    <label className="check-label">
                        <input
                            type="checkbox"
                            checked={tentacles}
                            disabled={!between || busy}
                            onChange={(e) => setTentacles(e.target.checked)}
                        />
                        {t("Tillat tentakler", "Allow tentacles")}
                    </label>
                    <label className="field">
                        {t("Husregler", "House rules")}
                        <textarea
                            rows={2}
                            value={rules}
                            maxLength={1500}
                            disabled={!between || busy}
                            onChange={(e) => setRules(e.target.value)}
                        />
                    </label>
                    <button
                        className="secondary-button full"
                        disabled={!between || busy}
                        onClick={() =>
                            void action("settings", {
                                hider,
                                hideMinutes: minutes,
                                tentacles,
                                rules,
                            })
                        }
                    >
                        {t("Lagre oppsett", "Save settings")}
                    </button>
                    <div className="boundary-options">
                        <span>
                            {t("Spilleområde", "Playing area")}:{" "}
                            {g.boundary.length
                                ? t("valgt", "set")
                                : t("mangler", "not set")}
                        </span>
                        <button
                            disabled={!between || busy}
                            onClick={() => {
                                mapDraft.set([]);
                                mapTool.set(
                                    tool === "boundary" ? null : "boundary",
                                );
                            }}
                        >
                            {t("Tegn", "Draw")}
                        </button>
                        <button
                            disabled={!between || busy}
                            onClick={() =>
                                void action("boundary", {
                                    points: osloBounds.features[0].geometry.coordinates[0]
                                        .slice(0, -1)
                                        .map(([lng, lat]) => [lat, lng]),
                                })
                            }
                        >
                            {t("Bruk Oslo", "Use Oslo")}
                        </button>
                    </div>
                    {tool === "boundary" && (
                        <div className="map-draft-actions">
                            <p>
                                {t(
                                    "Klikk rundt området på kartet.",
                                    "Click around the area on the map.",
                                )}{" "}
                                · {draft.length}
                            </p>
                            <button
                                className="secondary-button"
                                disabled={draft.length < 3 || busy}
                                onClick={async () => {
                                    if (
                                        await action("boundary", {
                                            points: draft,
                                        })
                                    ) {
                                        mapTool.set(null);
                                        mapDraft.set([]);
                                    }
                                }}
                            >
                                {t("Lagre område", "Save area")}
                            </button>
                            <button
                                className="secondary-button"
                                onClick={() => {
                                    mapTool.set(null);
                                    mapDraft.set([]);
                                }}
                            >
                                {t("Avbryt", "Cancel")}
                            </button>
                        </div>
                    )}
                    <button
                        className="primary-button full start-round"
                        disabled={!between || !g.boundary.length || busy}
                        onClick={async () => {
                            if (
                                window.confirm(
                                    t(
                                        "Starte runden med lagrede innstillinger?",
                                        "Start the round with the saved settings?",
                                    ),
                                )
                            )
                                await action("start");
                        }}
                    >
                        <Play size={16} />
                        {g.phase === "finished"
                            ? t("Start neste runde", "Start next round")
                            : t("Start runden", "Start round")}
                    </button>
                </>
            ) : (
                <>
                    <p className="small muted">
                        {t(
                            "Verten setter opp og starter runden.",
                            "The host sets up and starts the round.",
                        )}
                    </p>
                    {g.rules && <p className="room-rules">{g.rules}</p>}
                </>
            )}
        </div>
    );
}

function QuestionWorkspace({
    value,
    now,
    active,
}: {
    value: RoomView;
    now: number;
    active: boolean;
}) {
    const t = useText(),
        g = value.game,
        busy = useStore(actionBusy),
        pin = useStore(pickedPoint),
        [category, setCategory] = useState<Category>("radar"),
        [specId, setSpecId] = useState("radar-0"),
        [distance, setDistance] = useState("500"),
        [minutes, setMinutes] = useState(5),
        [detail, setDetail] = useState(""),
        [repeat, setRepeat] = useState(false),
        [answer, setAnswer] = useState(""),
        [photo, setPhoto] = useState(""),
        [uploading, setUploading] = useState(false),
        [photoError, setPhotoError] = useState("");
    const pending = g.questions.find((q) =>
            ["travelling", "waiting"].includes(q.status),
        ),
        spec = catalog.find((q) => q.id === specId)!;
    const blocked = g.curses.some(
        (c) => c.blocks && (!c.until || c.until > now),
    );
    const choose = (id: string) => {
        const s = catalog.find((s) => s.id === id)!;
        setSpecId(id);
        setCategory(s.category);
        setMinutes(s.minutes);
        setDistance(s.distance ? String(s.distance) : "");
        setRepeat(false);
    };
    const repeated = g.questions.filter((q) => q.spec === specId).length;
    useEffect(() => {
        setAnswer("");
        setPhoto("");
        setPhotoError("");
    }, [pending?.id]);
    const selectPin = () => {
        mapTool.set("point");
    };
    const photoUpload = async (file?: File) => {
        if (!file || !pending) return;
        setUploading(true);
        setPhotoError("");
        try {
            if (!file.type.startsWith("image/")) throw Error("photo_type");
            if (file.size > 20000000) throw Error("request_large");
            const image = await createImageBitmap(file);
            const factor = Math.min(
                1,
                1600 / Math.max(image.width, image.height),
            );
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.width * factor);
            canvas.height = Math.round(image.height * factor);
            canvas
                .getContext("2d")!
                .drawImage(image, 0, 0, canvas.width, canvas.height);
            image.close();
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/jpeg", 0.72),
            );
            if (!blob || blob.size > 1000000) throw Error("request_large");
            const c = credentials.get()!;
            const response = await fetch(
                `/api/rooms/${c.code}/photo?question=${pending.id}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${c.token}`,
                        "Content-Type": "image/jpeg",
                    },
                    body: blob,
                },
            );
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            setPhoto(result.photo);
        } catch (e) {
            setPhotoError(message((e as Error).message));
        } finally {
            setUploading(false);
        }
    };
    return (
        <div className="question-workspace">
            {pending && (
                <article className="pending-question">
                    <div className="question-status">
                        <span>
                            {t(
                                categoryLabels[pending.category][0],
                                categoryLabels[pending.category][1],
                            )}
                        </span>
                        <b>
                            {pending.status === "travelling"
                                ? t("Underveis", "Travelling")
                                : g.pausedAt
                                  ? t("Pause", "Paused")
                                  : now > (pending.deadline || Infinity)
                                    ? t("Fristen er ute", "Overdue")
                                    : clock(
                                          (pending.deadline || now) -
                                              (g.pausedAt || now),
                                      )}
                        </b>
                    </div>
                    <h2>{questionName(pending)}</h2>
                    {pending.detail && <p>{pending.detail}</p>}
                    {pending.distance && (
                        <small>{pending.distance.toLocaleString()} m</small>
                    )}
                    {pending.status === "travelling" && !value.me.hider && (
                        <div className="journey-end">
                            <button
                                className="secondary-button full"
                                onClick={selectPin}
                            >
                                <MapPin size={15} />
                                {t("Velg sluttpunkt", "Choose end pin")}
                            </button>
                            {pin && (
                                <p className="small muted">
                                    {pin.map((x) => x.toFixed(5)).join(", ")}
                                </p>
                            )}
                            <button
                                className="primary-button full"
                                disabled={!active || busy || !pin}
                                onClick={() =>
                                    void action("thermoEnd", {
                                        question: pending.id,
                                        end: pin,
                                    })
                                }
                            >
                                {t("Send sluttpunkt", "Send end pin")}
                            </button>
                        </div>
                    )}
                    {pending.status === "waiting" && value.me.hider && (
                        <>
                            <div className="answer-options">
                                {answerOptions(pending.category).map(
                                    ([key, nb, en]) => (
                                        <button
                                            key={key}
                                            aria-pressed={answer === key}
                                            onClick={() => setAnswer(key)}
                                        >
                                            {t(nb, en)}
                                        </button>
                                    ),
                                )}
                            </div>
                            <label className="field">
                                {t("Svar", "Answer")}
                                <textarea
                                    rows={2}
                                    maxLength={3000}
                                    value={answer}
                                    onChange={(e) => setAnswer(e.target.value)}
                                />
                            </label>
                            {pending.category === "photo" && (
                                <label className="photo-upload">
                                    {photo ? (
                                        <Check size={15} />
                                    ) : (
                                        <Plus size={15} />
                                    )}{" "}
                                    {photo
                                        ? t("Bilde lagt ved", "Photo attached")
                                        : t("Legg ved bilde", "Attach photo")}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        disabled={uploading || busy}
                                        onChange={(e) =>
                                            void photoUpload(
                                                e.target.files?.[0],
                                            )
                                        }
                                    />
                                </label>
                            )}
                            {photoError && (
                                <p className="room-error">{photoError}</p>
                            )}
                            <button
                                className="primary-button full"
                                disabled={
                                    !active ||
                                    busy ||
                                    uploading ||
                                    (!answer.trim() && !photo)
                                }
                                onClick={() =>
                                    void action("answer", {
                                        question: pending.id,
                                        answer:
                                            answer.trim() ||
                                            (language.get() === "nb"
                                                ? "Foto vedlagt"
                                                : "Photo attached"),
                                        ...(photo ? { photo } : {}),
                                    })
                                }
                            >
                                {uploading
                                    ? t("Laster opp…", "Uploading…")
                                    : t("Send svar", "Send answer")}
                            </button>
                            <button
                                className="text-button"
                                disabled={!active || busy}
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            t(
                                                "Bruke veto på spørsmålet?",
                                                "Use a veto on this question?",
                                            ),
                                        )
                                    )
                                        void action("veto", {
                                            question: pending.id,
                                        });
                                }}
                            >
                                {t("Bruk veto", "Use veto")}
                            </button>
                        </>
                    )}
                    {pending.status === "waiting" && !value.me.hider && (
                        <p className="small muted">
                            {t(
                                "Venter på gjemmelaget.",
                                "Waiting for the hiding team.",
                            )}
                        </p>
                    )}
                </article>
            )}
            {!value.me.hider && !pending && (
                <form
                    className="question-form"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                            await action("ask", {
                                spec: specId,
                                minutes,
                                detail,
                                start: pin || undefined,
                                distance: distance
                                    ? Number(distance)
                                    : undefined,
                                confirmRepeat: repeat,
                            })
                        ) {
                            setDetail("");
                            setRepeat(false);
                        }
                    }}
                >
                    <label className="field">
                        {t("Kategori", "Category")}
                        <select
                            value={category}
                            onChange={(e) => {
                                const cat = e.target.value as Category;
                                choose(
                                    catalog.find((q) => q.category === cat)!.id,
                                );
                            }}
                        >
                            {Object.entries(categoryLabels)
                                .filter(
                                    ([id]) => id !== "tentacle" || g.tentacles,
                                )
                                .map(([id, names]) => (
                                    <option key={id} value={id}>
                                        {t(names[0], names[1])}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <label className="field">
                        {t("Spørsmål", "Question")}
                        <select
                            value={specId}
                            onChange={(e) => choose(e.target.value)}
                        >
                            {catalog
                                .filter((q) => q.category === category)
                                .map((q) => (
                                    <option key={q.id} value={q.id}>
                                        {t(q.nb, q.en)}
                                    </option>
                                ))}
                        </select>
                    </label>
                    {["radar", "thermometer"].includes(category) && (
                        <>
                            <label className="field">
                                {t("Avstand · meter", "Distance · metres")}
                                <input
                                    type="number"
                                    min={1}
                                    max={500000}
                                    required
                                    value={distance}
                                    onChange={(e) =>
                                        setDistance(e.target.value)
                                    }
                                />
                            </label>
                            <button
                                type="button"
                                className="secondary-button full"
                                onClick={selectPin}
                            >
                                <MapPin size={15} />
                                {pin
                                    ? t("Endre startpunkt", "Change start pin")
                                    : t("Velg startpunkt", "Choose start pin")}
                            </button>
                            {pin && (
                                <p className="pin-coordinates">
                                    {pin.map((x) => x.toFixed(5)).join(", ")}
                                </p>
                            )}
                        </>
                    )}
                    <label className="field">
                        {t("Presisering", "Details")}
                        <textarea
                            rows={2}
                            maxLength={1500}
                            value={detail}
                            onChange={(e) => setDetail(e.target.value)}
                            placeholder={t(
                                "Sted, område eller referanse",
                                "Place, area or reference",
                            )}
                        />
                    </label>
                    <div className="question-cost">
                        <label>
                            {t("Svarfrist", "Answer time")}
                            <input
                                aria-label={t(
                                    "Svarfrist i minutter",
                                    "Answer time in minutes",
                                )}
                                type="number"
                                min={1}
                                max={60}
                                value={minutes}
                                onChange={(e) =>
                                    setMinutes(Number(e.target.value))
                                }
                            />{" "}
                            min
                        </label>
                        <span>
                            {t("Trekk", "Draw")} {spec.draw} ·{" "}
                            {t("behold", "keep")} {spec.keep}
                            {repeated > 0 ? ` × ${repeated + 1}` : ""}
                        </span>
                    </div>
                    {repeated > 0 && (
                        <label className="check-label">
                            <input
                                type="checkbox"
                                checked={repeat}
                                required
                                onChange={(e) => setRepeat(e.target.checked)}
                            />
                            {t("Bekreft gjentakelse", "Confirm repeat")} ·{" "}
                            {repeated + 1}×
                        </label>
                    )}
                    <button
                        className="primary-button full"
                        disabled={
                            !active ||
                            busy ||
                            blocked ||
                            (["radar", "thermometer"].includes(category) &&
                                !pin)
                        }
                    >
                        {t("Send spørsmål", "Ask question")}
                    </button>
                </form>
            )}
            {!pending && value.me.hider && (
                <p className="room-empty">
                    {active
                        ? t(
                              "Ingen ubesvarte spørsmål.",
                              "No questions awaiting an answer.",
                          )
                        : t("Venter på letingen.", "Waiting for seeking.")}
                </p>
            )}
            <div className="question-history">
                {[...g.questions]
                    .reverse()
                    .filter((q) => ["answered", "vetoed"].includes(q.status))
                    .map((q) => (
                        <article key={q.id}>
                            <div className="history-category">
                                {t(
                                    categoryLabels[q.category][0],
                                    categoryLabels[q.category][1],
                                )}
                                <time>
                                    {new Date(q.answeredAt!).toLocaleTimeString(
                                        language.get() === "nb"
                                            ? "nb-NO"
                                            : "en-GB",
                                        { hour: "2-digit", minute: "2-digit" },
                                    )}
                                </time>
                            </div>
                            <h3>{questionName(q)}</h3>
                            {q.detail && (
                                <p className="small muted">{q.detail}</p>
                            )}
                            <p className="history-answer">
                                {answerLabel(q.answer || "")}
                            </p>
                            {q.photo && <Evidence id={q.photo} />}
                            {value.me.hider && (
                                <p className="draw-reward">
                                    {q.late || q.status === "vetoed"
                                        ? t("Ingen kort", "No cards")
                                        : `${t("Trekk", "Draw")} ${q.draw}, ${t("behold", "keep")} ${q.keep}${q.repeat > 1 ? ` × ${q.repeat}` : ""}`}
                                </p>
                            )}
                        </article>
                    ))}
            </div>
            {!value.me.hider && <MapNotes value={value} />}
        </div>
    );
}
function questionName(q: Asked) {
    const spec = catalog.find((s) => s.id === q.spec);
    return spec ? (language.get() === "nb" ? spec.nb : spec.en) : q.spec;
}
function answerOptions(category: Category) {
    const options: Record<string, string[][]> = {
        radar: [
            ["yes", "Innenfor", "Inside"],
            ["no", "Utenfor", "Outside"],
        ],
        matching: [
            ["same", "Samme", "Same"],
            ["different", "Forskjellig", "Different"],
        ],
        measuring: [
            ["closer", "Nærmere", "Closer"],
            ["further", "Lenger unna", "Further"],
        ],
        thermometer: [
            ["warmer", "Varmere", "Warmer"],
            ["colder", "Kaldere", "Colder"],
        ],
    };
    return options[category] || [];
}
function answerLabel(answer: string) {
    const labels = [
        ...Object.values(categoryLabels).flatMap((_, i) =>
            answerOptions(
                ["radar", "matching", "measuring", "thermometer"][
                    i
                ] as Category,
            ),
        ),
        ["veto", "Veto brukt", "Veto used"],
    ];
    const found = labels.find((row) => row[0] === answer);
    return found ? found[language.get() === "nb" ? 1 : 2] : answer;
}
function Evidence({ id }: { id: string }) {
    const t = useText(),
        [url, setUrl] = useState(""),
        [failed, setFailed] = useState(false);
    useEffect(() => {
        const c = credentials.get();
        if (!c) return;
        let active = true,
            object = "";
        fetch(`/api/rooms/${c.code}/photo?id=${id}`, {
            headers: { Authorization: `Bearer ${c.token}` },
        })
            .then((r) => {
                if (!r.ok) throw Error();
                return r.blob();
            })
            .then((blob) => {
                if (active) {
                    object = URL.createObjectURL(blob);
                    setUrl(object);
                }
            })
            .catch(() => setFailed(true));
        return () => {
            active = false;
            if (object) URL.revokeObjectURL(object);
        };
    }, [id]);
    return url ? (
        <a href={url} target="_blank" rel="noreferrer">
            <img
                className="evidence-image"
                src={url}
                alt={t("Svarbilde", "Photo answer")}
            />
        </a>
    ) : (
        <span className="small muted">
            {failed
                ? t("Bildet kunne ikke lastes.", "Photo could not be loaded.")
                : t("Henter bilde…", "Loading photo…")}
        </span>
    );
}
function MapNotes({ value }: { value: RoomView }) {
    const t = useText(),
        tool = useStore(mapTool),
        draft = useStore(mapDraft),
        pin = useStore(pickedPoint),
        busy = useStore(actionBusy);
    return (
        <details className="compact-details">
            <summary>
                {t("Kartnotater", "Map notes")} · {value.game.marks.length}
            </summary>
            <div className="map-note-actions">
                <button
                    className="secondary-button"
                    onClick={() => {
                        mapTool.set("point");
                    }}
                >
                    <MapPin size={14} />
                    {t("Velg punkt", "Choose pin")}
                </button>
                <button
                    className="secondary-button"
                    disabled={!pin || busy}
                    onClick={() =>
                        void action("mark", {
                            kind: "pin",
                            points: [pin],
                            label: t("Notat", "Note"),
                        })
                    }
                >
                    {t("Lagre punkt", "Save pin")}
                </button>
                <button
                    className="secondary-button"
                    onClick={() => {
                        mapDraft.set([]);
                        mapTool.set("exclude");
                    }}
                >
                    {t("Utelukk område", "Exclude area")}
                </button>
            </div>
            {tool === "exclude" && (
                <div className="map-draft-actions">
                    <span>
                        {draft.length} {t("punkter", "points")}
                    </span>
                    <button
                        className="secondary-button"
                        disabled={draft.length < 3 || busy}
                        onClick={async () => {
                            if (
                                await action("mark", {
                                    kind: "exclude",
                                    points: draft,
                                    label: t("Utelukket", "Excluded"),
                                })
                            ) {
                                mapTool.set(null);
                                mapDraft.set([]);
                            }
                        }}
                    >
                        {t("Lagre", "Save")}
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => {
                            mapTool.set(null);
                            mapDraft.set([]);
                        }}
                    >
                        {t("Avbryt", "Cancel")}
                    </button>
                </div>
            )}
            {value.game.marks.map((mark) => (
                <div className="member-row" key={mark.id}>
                    <span>{mark.label}</span>
                    <button
                        aria-label={t("Slett kartnotat", "Remove map note")}
                        disabled={busy}
                        onClick={() =>
                            void action("removeMark", { mark: mark.id })
                        }
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}
        </details>
    );
}

function Hand({ value, active }: { value: RoomView; active: boolean }) {
    const t = useText(),
        busy = useStore(actionBusy),
        [adding, setAdding] = useState(false),
        [name, setName] = useState(""),
        [type, setType] = useState<"curse" | "powerup" | "time">("curse"),
        [effect, setEffect] = useState(""),
        [minutes, setMinutes] = useState(0),
        [blocks, setBlocks] = useState(false),
        [notes, setNotes] = useState(value.game.privateNotes);
    const g = value.game,
        last = [...g.questions].reverse().find((q) => q.status === "answered"),
        held = g.cards
            .filter((c) => c.type === "time")
            .reduce((s, c) => s + c.minutes, 0);
    return (
        <div className="hand-workspace">
            <div className="hand-summary">
                <span>
                    {g.cards.length}/{g.handLimit} {t("kort", "cards")}
                </span>
                <span>+{held} min</span>
            </div>
            {last && (
                <p className="draw-reward">
                    {last.late
                        ? t("Sent svar · ingen kort", "Late answer · no cards")
                        : `${t("Trekk", "Draw")} ${last.draw}, ${t("behold", "keep")} ${last.keep}${last.repeat > 1 ? ` × ${last.repeat}` : ""}`}
                </p>
            )}
            {g.cards.length > g.handLimit && (
                <p className="room-error">
                    {t(
                        "Du har for mange kort.",
                        "You are over your hand limit.",
                    )}
                </p>
            )}
            {g.cards.map((card) => (
                <article className={`hand-card ${card.type}`} key={card.id}>
                    <span>
                        {card.type === "curse"
                            ? t("Forbannelse", "Curse")
                            : card.type === "time"
                              ? t("Tidsbonus", "Time bonus")
                              : "Power-up"}
                    </span>
                    <h3>{card.name}</h3>
                    {card.type === "time" ? (
                        <strong>+{card.minutes} min</strong>
                    ) : (
                        <p>{card.effect}</p>
                    )}
                    <div>
                        {card.type !== "time" && (
                            <button
                                className="secondary-button"
                                disabled={!active || busy}
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            t(
                                                "Er kortkostnaden og vilkårene oppfylt? Kortet blir synlig for leterne.",
                                                "Have you met the card cost and conditions? Seekers will see its effect.",
                                            ),
                                        )
                                    )
                                        void action("playCard", {
                                            card: card.id,
                                            confirmCost: true,
                                        });
                                }}
                            >
                                {t("Spill kort", "Play card")}
                            </button>
                        )}
                        <button
                            className="icon-button"
                            aria-label={t("Kast kort", "Discard card")}
                            disabled={busy || g.phase === "finished"}
                            onClick={() => {
                                if (
                                    window.confirm(
                                        t(
                                            "Kaste kortet?",
                                            "Discard this card?",
                                        ),
                                    )
                                )
                                    void action("discardCard", {
                                        card: card.id,
                                    });
                            }}
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                </article>
            ))}
            <button
                className="secondary-button full"
                disabled={g.phase === "finished"}
                onClick={() => setAdding(!adding)}
            >
                <Plus size={15} />
                {t("Legg til trukket kort", "Add drawn card")}
            </button>
            {adding && (
                <form
                    className="add-card-form"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                            await action("addCard", {
                                name,
                                type,
                                effect,
                                minutes: type === "powerup" ? 0 : minutes,
                                blocks,
                            })
                        ) {
                            setAdding(false);
                            setName("");
                            setEffect("");
                        }
                    }}
                >
                    <label className="field">
                        {t("Type", "Type")}
                        <select
                            value={type}
                            onChange={(e) =>
                                setType(e.target.value as typeof type)
                            }
                        >
                            <option value="curse">
                                {t("Forbannelse", "Curse")}
                            </option>
                            <option value="powerup">Power-up</option>
                            <option value="time">
                                {t("Tidsbonus", "Time bonus")}
                            </option>
                        </select>
                    </label>
                    <label className="field">
                        {t("Kortnavn", "Card name")}
                        <input
                            value={name}
                            required
                            maxLength={100}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </label>
                    {type !== "time" && (
                        <label className="field">
                            {t("Effekt", "Effect")}
                            <textarea
                                value={effect}
                                rows={2}
                                maxLength={1500}
                                onChange={(e) => setEffect(e.target.value)}
                            />
                        </label>
                    )}
                    {type !== "powerup" && (
                        <label className="field">
                            {t("Minutter", "Minutes")}
                            <input
                                type="number"
                                min={0}
                                max={type === "time" ? 1440 : 240}
                                value={minutes}
                                onChange={(e) =>
                                    setMinutes(Number(e.target.value))
                                }
                            />
                        </label>
                    )}
                    {type === "curse" && (
                        <label className="check-label">
                            <input
                                type="checkbox"
                                checked={blocks}
                                onChange={(e) => setBlocks(e.target.checked)}
                            />
                            {t("Blokkerer spørsmål", "Blocks questions")}
                        </label>
                    )}
                    <button className="primary-button full" disabled={busy}>
                        {t("Legg til", "Add")}
                    </button>
                </form>
            )}
            <details className="compact-details">
                <summary>{t("Private notater", "Private notes")}</summary>
                <textarea
                    className="private-notes"
                    rows={3}
                    value={notes}
                    maxLength={3000}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void action("notes", { text: notes })}
                >
                    {t("Lagre", "Save")}
                </button>
                <label className="field">
                    {t("Håndgrense", "Hand limit")}
                    <input
                        type="number"
                        min={1}
                        max={30}
                        value={g.handLimit}
                        onChange={(e) => {
                            if (e.target.validity.valid)
                                void action("handLimit", {
                                    limit: Number(e.target.value),
                                });
                        }}
                    />
                </label>
            </details>
        </div>
    );
}
function Scoreboard({ value }: { value: RoomView }) {
    const t = useText(),
        g = value.game;
    const teams = g.teams
        .map((team) => {
            const scores = g.scores.filter((s) => s.team === team.id);
            return {
                ...team,
                best: scores.length
                    ? Math.max(
                          ...scores.map((s) => s.seconds + s.bonusMinutes * 60),
                      )
                    : null,
            };
        })
        .sort((a, b) => (b.best ?? -1) - (a.best ?? -1));
    return (
        <div className="room-scoreboard">
            <h2>{t("Beste runde", "Best round")}</h2>
            {teams.map((team, i) => (
                <div className="score-row" key={team.id}>
                    <span>{i + 1}</span>
                    <b style={{ color: team.color }}>{team.name}</b>
                    <strong>
                        {team.best === null ? "—" : clock(team.best * 1000)}
                    </strong>
                </div>
            ))}
            <details className="compact-details">
                <summary>{t("Alle runder", "All rounds")}</summary>
                {g.scores.map((s) => (
                    <p className="member-row" key={s.round}>
                        <span>
                            {s.round} ·{" "}
                            {g.teams.find((t) => t.id === s.team)?.name}
                        </span>
                        <small>
                            {clock(s.seconds * 1000)} + {s.bonusMinutes} min
                        </small>
                    </p>
                ))}
            </details>
        </div>
    );
}
