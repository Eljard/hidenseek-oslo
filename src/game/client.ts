import { persistentAtom } from "@nanostores/persistent";
import { atom } from "nanostores";
import { toast } from "react-toastify";

import { multiplayerActive } from "@/lib/context";
import { language } from "@/oslo/state";

import type { Point, RoomEvent, RoomView } from "./model";

export const credentials = persistentAtom<{
    code: string;
    token: string;
} | null>("oslo-room", null, { encode: JSON.stringify, decode: JSON.parse });
export const room = atom<RoomView | null>(null);
const savedRooms = persistentAtom<Record<string, string>>(
    "oslo-room-keys",
    {},
    { encode: JSON.stringify, decode: JSON.parse },
);
export const connection = atom<
    "connecting" | "live" | "reconnecting" | "offline"
>("connecting");
export const actionBusy = atom(false);
export const roomError = atom("");
export const pickedPoint = atom<Point | null>(null);
export const mapTool = atom<"point" | "boundary" | "exclude" | null>(null);
export const mapDraft = atom<Point[]>([]);
export const notifications = persistentAtom<boolean>(
    "oslo-notifications",
    false,
    { encode: JSON.stringify, decode: JSON.parse },
);
export const eventNames: Record<string, [string, string]> = {
    question: ["Nytt spørsmål", "New question"],
    travelling: ["Varmere/kaldere startet", "Thermometer started"],
    answer: ["Svar mottatt", "Answer received"],
    late_answer: ["Sent svar · ingen kort", "Late answer · no cards"],
    veto: ["Spørsmål avvist", "Question vetoed"],
    deadline: ["Svarfristen er ute", "Answer overdue"],
    hiding: ["Gjemmetid startet", "Hiding started"],
    seeking: ["Letingen har startet", "Seeking started"],
    paused: ["Spillet er på pause", "Game paused"],
    resumed: ["Spillet fortsetter", "Game resumed"],
    endgame: ["Sluttspill startet", "Endgame started"],
    caught: ["Gjemmeren er funnet", "Hider caught"],
    curse: ["Forbannelse spilt", "Curse played"],
    curse_ended: ["Forbannelsen er avsluttet", "Curse cleared"],
    powerup: ["Power-up spilt", "Power-up played"],
};
export const errorNames: Record<string, [string, string]> = {
    conflict: [
        "Spillet ble endret. Prøv igjen.",
        "The game changed. Try again.",
    ],
    room_missing: [
        "Fant ikke spillet. Sjekk koden.",
        "Game not found. Check the code.",
    ],
    join_first: ["Bli med i spillet først.", "Join the game first."],
    not_active: ["Vent til letingen er i gang.", "Wait until seeking starts."],
    question_pending: [
        "Fullfør gjeldende spørsmål først.",
        "Finish the current question first.",
    ],
    curse_blocks: [
        "En forbannelse blokkerer nye spørsmål.",
        "A curse blocks new questions.",
    ],
    confirm_repeat: ["Bekreft gjentakelsen.", "Confirm the repeat."],
    boundary_required: [
        "Tegn et spilleområde først.",
        "Draw a playing area first.",
    ],
    journey_short: [
        "Endepunktet er for nær startpunktet.",
        "The end pin is too close to the start pin.",
    ],
    host_only: ["Bare verten kan gjøre dette.", "Only the host can do this."],
    hider_only: [
        "Bare gjemmelaget kan gjøre dette.",
        "Only the hiding team can do this.",
    ],
    seeker_only: ["Bare leterne kan gjøre dette.", "Only seekers can do this."],
    team_locked: [
        "Lagene er låst i denne runden.",
        "Teams are locked during the round.",
    ],
    push_unavailable: [
        "Enhetsvarsler er ikke tilgjengelig.",
        "Device alerts are unavailable.",
    ],
    unique_teams: ["Bruk ulike lagnavn.", "Use unique team names."],
    invalid_text: ["Sjekk tekstfeltene.", "Check the text fields."],
    invalid_number: ["Sjekk tallverdiene.", "Check the numbers."],
    invalid_point: ["Velg et gyldig kartpunkt.", "Choose a valid map pin."],
    pin_required: ["Velg et punkt på kartet.", "Choose a map pin."],
    confirm_cost: ["Bekreft kortkostnaden.", "Confirm the card cost."],
    hand_full: ["Kast et kort først.", "Discard a card first."],
    room_full: ["Spillet er fullt.", "The game is full."],
    photo_type: ["Velg et bilde.", "Choose a photo."],
    photo_missing: [
        "Bildet er ikke tilgjengelig.",
        "The photo is unavailable.",
    ],
    request_large: ["Filen er for stor.", "The file is too large."],
    network: ["Ingen forbindelse. Prøv igjen.", "No connection. Try again."],
};
export function message(code: string) {
    return (
        errorNames[code]?.[language.get() === "en" ? 1 : 0] ||
        (language.get() === "en"
            ? "Could not save. Try again."
            : "Kunne ikke lagre. Prøv igjen.")
    );
}
let seen = 0,
    seenRoom = "",
    socket: WebSocket | null = null;
export function accept(view: RoomView, announce = true) {
    if (view.game.code !== seenRoom) {
        seen = 0;
        seenRoom = view.game.code;
        announce = false;
    }
    const previous = room.get();
    if (
        previous?.game.code === view.game.code &&
        previous.game.version > view.game.version
    )
        return;
    const nextEvents = view.game.events.filter((e) => e.seq > seen);
    seen = Math.max(seen, view.game.eventSeq);
    room.set(view);
    multiplayerActive.set(true);
    if (announce)
        for (const event of nextEvents) {
            const label =
                eventNames[event.kind]?.[language.get() === "en" ? 1 : 0];
            if (label)
                toast.info(label, {
                    toastId: `${view.game.code}-${event.seq}`,
                });
        }
}
export async function api(
    path: string,
    input?: unknown,
    token: string | null = credentials.get()?.token ?? null,
) {
    let response: Response;
    try {
        response = await fetch(path, {
            method: input === undefined ? "GET" : "POST",
            headers: {
                ...(input !== undefined
                    ? { "Content-Type": "application/json" }
                    : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: input === undefined ? undefined : JSON.stringify(input),
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw Error("network");
    }
    const value = await response.json();
    if (!response.ok) throw Error(value.error || "network");
    return value;
}
export async function refresh() {
    const c = credentials.get();
    if (!c) return;
    const v = await api(`/api/rooms/${c.code}`);
    accept(v);
}
export async function createRoom(input: unknown) {
    const value = await api("/api/rooms", input, null);
    credentials.set({ code: value.game.code, token: value.token });
    savedRooms.set({ ...savedRooms.get(), [value.game.code]: value.token });
    accept(value, false);
    history.replaceState(null, "", `/?room=${value.game.code}#game`);
    return value as RoomView;
}
export async function joinRoom(code: string, name: string, team: string) {
    const current = credentials.get();
    const saved =
        current?.code === code ? current.token : savedRooms.get()[code];
    const value = await api(
        `/api/rooms/${code}/join`,
        { name, team },
        saved || null,
    );
    const token = value.token || saved;
    savedRooms.set({ ...savedRooms.get(), [code]: token });
    credentials.set({ code, token });
    accept(value, false);
    history.replaceState(null, "", `/?room=${code}#game`);
    return value as RoomView;
}
export async function action(op: string, input: Record<string, unknown> = {}) {
    const c = credentials.get(),
        current = room.get();
    if (!c || !current || actionBusy.get()) return false;
    actionBusy.set(true);
    roomError.set("");
    try {
        const v = await api(`/api/rooms/${c.code}/action`, {
            op,
            version: current.game.version,
            ...input,
        });
        accept(v);
        return true;
    } catch (e) {
        const code = (e as Error).message;
        roomError.set(message(code));
        if (code === "conflict") await refresh().catch(() => {});
        return false;
    } finally {
        actionBusy.set(false);
    }
}
export function leaveRoom() {
    const c = credentials.get();
    if (c) savedRooms.set({ ...savedRooms.get(), [c.code]: c.token });
    if (c && room.get()?.me.hider === false)
        void api(
            `/api/rooms/${c.code}/location`,
            { location: null },
            c.token,
        ).catch(() => {});
    if (c && notifications.get()) {
        void navigator.serviceWorker
            ?.getRegistration("/sw.js")
            .then(async (registration) => {
                const sub = await registration?.pushManager.getSubscription();
                if (sub)
                    await api(
                        `/api/rooms/${c.code}/unsubscribe`,
                        { endpoint: sub.endpoint },
                        c.token,
                    );
            })
            .catch(() => {});
    }
    socket?.close();
    credentials.set(null);
    room.set(null);
    multiplayerActive.set(true);
    pickedPoint.set(null);
    mapTool.set(null);
    mapDraft.set([]);
    seen = 0;
}
export function connectRoom() {
    const c = credentials.get();
    if (!c) {
        connection.set("offline");
        return () => {};
    }
    let stopped = false,
        retry: ReturnType<typeof setTimeout> | undefined,
        attempt = 0;
    const reload = () =>
        refresh().catch((e) => {
            connection.set("offline");
            roomError.set(message((e as Error).message));
        });
    const connect = () => {
        if (stopped) return;
        connection.set(attempt ? "reconnecting" : "connecting");
        const ws = new WebSocket(
            `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${c.code}/socket`,
        );
        socket = ws;
        ws.onopen = () => {
            ws.send(JSON.stringify({ token: c.token }));
        };
        ws.onmessage = (event) => {
            try {
                const value = JSON.parse(event.data);
                if (value.type === "state") {
                    accept(value);
                    connection.set("live");
                    attempt = 0;
                    roomError.set("");
                }
            } catch {
                /* Ignore malformed packets. */
            }
        };
        ws.onclose = (event) => {
            if (stopped) return;
            connection.set("reconnecting");
            if (event.code === 1008) {
                roomError.set(message("join_first"));
                return;
            }
            retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++));
        };
        ws.onerror = () => ws.close();
    };
    reload();
    connect();
    const poll = setInterval(() => {
        if (connection.get() !== "live") reload();
    }, 15000);
    if (notifications.get()) void syncNotifications().catch(() => {});
    const visible = () => {
        if (document.visibilityState === "visible") {
            reload();
            if (socket?.readyState === WebSocket.OPEN) socket.send("{}");
        }
    };
    const online = () => {
        reload();
        if (socket?.readyState === WebSocket.CLOSED) {
            clearTimeout(retry);
            connect();
        }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", online);
    return () => {
        stopped = true;
        clearTimeout(retry);
        clearInterval(poll);
        socket?.close();
        document.removeEventListener("visibilitychange", visible);
        window.removeEventListener("online", online);
    };
}
export async function enableNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator))
        throw Error("unsupported");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw Error("denied");
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const config = await api("/api/config", undefined, null);
    if (!config.pushKey) throw Error("unavailable");
    const raw = atob(config.pushKey.replaceAll("-", "+").replaceAll("_", "/"));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
        }));
    const c = credentials.get()!;
    await api(`/api/rooms/${c.code}/subscribe`, {
        ...subscription.toJSON(),
        language: language.get(),
    });
    notifications.set(true);
}
async function syncNotifications() {
    if (
        !("serviceWorker" in navigator) ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
    )
        return;
    const registration =
        await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await registration?.pushManager.getSubscription();
    const c = credentials.get();
    if (sub && c)
        await api(`/api/rooms/${c.code}/subscribe`, {
            ...sub.toJSON(),
            language: language.get(),
        });
}
export async function disableNotifications() {
    const registration =
            await navigator.serviceWorker.getRegistration("/sw.js"),
        sub = await registration?.pushManager.getSubscription(),
        c = credentials.get();
    if (sub && c)
        await api(`/api/rooms/${c.code}/unsubscribe`, {
            endpoint: sub.endpoint,
        });
    if (sub) await sub.unsubscribe();
    notifications.set(false);
}
export function clock(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600)
        .toString()
        .padStart(2, "0")}:${Math.floor((s / 60) % 60)
        .toString()
        .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
export function labelEvent(event: RoomEvent) {
    return (
        eventNames[event.kind]?.[language.get() === "en" ? 1 : 0] || event.kind
    );
}
