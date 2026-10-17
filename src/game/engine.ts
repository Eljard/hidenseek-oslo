import { catalog } from "./catalog";
import {
    type Game,
    GameError,
    type Member,
    type Point,
    type RoomEvent,
    type RoomView,
} from "./model";
export const teamColors = [
    "#2268a2",
    "#c74756",
    "#34865c",
    "#8a5599",
    "#bf681b",
    "#247c82",
];
export function text(v: unknown, max = 100) {
    if (typeof v !== "string" || !v.trim() || v.length > max)
        throw new GameError("invalid_text");
    return v.trim();
}
export function number(v: unknown, min: number, max: number) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
        throw new GameError("invalid_number");
    return v;
}
export function point(v: unknown): Point {
    if (!Array.isArray(v) || v.length !== 2)
        throw new GameError("invalid_point");
    return [number(v[0], -90, 90), number(v[1], -180, 180)];
}
export function metres(a: Point, b: Point) {
    const r = Math.PI / 180,
        dLat = (b[0] - a[0]) * r,
        dLon = (b[1] - a[1]) * r,
        h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function emit(
    g: Game,
    kind: string,
    audience: RoomEvent["audience"] = "all",
    now = Date.now(),
    question?: string,
    title?: string,
) {
    g.events.push({
        seq: ++g.eventSeq,
        at: now,
        kind,
        audience,
        question,
        title,
    });
    g.events = g.events.slice(-200);
}
export function phaseAt(g: Game, now: number) {
    return g.phase === "hiding" && now >= g.hideEnd ? "seeking" : g.phase;
}
export function scoreAt(g: Game, now: number) {
    if (!["seeking", "endgame"].includes(phaseAt(g, now)) || g.pausedAt)
        return g.scoredMs;
    const waiting = g.questions.find((q) => q.status === "waiting");
    return (
        g.scoredMs +
        Math.max(
            0,
            Math.min(now, waiting?.deadline ?? now) -
                Math.max(g.scoreAnchor, g.seekStart),
        )
    );
}
export function advance(g: Game, now: number) {
    let changed = false;
    if (g.phase === "hiding" && now >= g.hideEnd) {
        g.phase = "seeking";
        g.scoreAnchor = g.hideEnd;
        emit(g, "seeking", "all", now);
        changed = true;
    }
    if (["seeking", "endgame"].includes(g.phase)) {
        g.scoredMs = scoreAt(g, now);
        g.scoreAnchor = now;
    }
    const waiting = g.questions.find((q) => q.status === "waiting");
    if (
        !g.pausedAt &&
        waiting?.deadline &&
        now >= waiting.deadline &&
        !waiting.overdueNotified
    ) {
        waiting.overdueNotified = true;
        emit(g, "deadline", "all", now, waiting.id);
        changed = true;
    }
    const expired = g.curses.filter((c) => c.until > 0 && now >= c.until);
    if (!g.pausedAt && expired.length) {
        g.curses = g.curses.filter((c) => !expired.includes(c));
        emit(g, "curse_ended", "all", now);
        changed = true;
    }
    return changed;
}
export function createGame(
    code: string,
    input: any,
    member: Member,
    now: number,
): Game {
    if (
        !Array.isArray(input.teams) ||
        input.teams.length < 2 ||
        input.teams.length > 50
    )
        throw new GameError("team_count");
    const names = input.teams.map((n: unknown) => text(n, 40));
    if (
        new Set(names.map((n: string) => n.toLocaleLowerCase())).size !==
        names.length
    )
        throw new GameError("unique_teams");
    const teams = names.map((name: string, i: number) => ({
        id: crypto.randomUUID(),
        name,
        color: teamColors[i % teamColors.length],
    }));
    member.team = teams[0].id;
    return {
        code,
        name: text(input.name, 80),
        version: 1,
        host: member.id,
        teams,
        hider: teams[0].id,
        phase: "lobby",
        round: 1,
        hideMinutes: number(input.hideMinutes ?? 30, 1, 180),
        hideEnd: 0,
        seekStart: 0,
        pausedAt: null,
        scoredMs: 0,
        scoreAnchor: 0,
        boundary: [],
        questions: [],
        marks: [],
        cards: [],
        handLimit: 6,
        privateNotes: "",
        curses: [],
        tentacles: false,
        rules: "",
        scores: [],
        events: [],
        eventSeq: 0,
        members: [member],
        createdAt: now,
        updatedAt: now,
    };
}
export function view(
    g: Game,
    m: Member,
    now: number,
    pushReady = false,
): RoomView {
    const publicGame = structuredClone(g) as any;
    delete publicGame.host;
    delete publicGame.members;
    const hider = m.team === g.hider;
    if (!hider) {
        publicGame.cards = [];
        publicGame.privateNotes = "";
    } else publicGame.marks = [];
    publicGame.events = publicGame.events.filter(
        (e: RoomEvent) =>
            e.audience === "all" ||
            (hider ? e.audience === "hider" : e.audience === "seekers"),
    );
    publicGame.phase = phaseAt(g, now);
    return {
        game: publicGame,
        me: { id: m.id, team: m.team, host: m.id === g.host, hider },
        members: g.members.map(({ id, name, team }) => ({ id, name, team })),
        locations: g.members
            .filter(
                (x) =>
                    x.team !== g.hider &&
                    x.location &&
                    now - x.location.at < 300000,
            )
            .map((x) => ({
                id: x.id,
                team: x.team,
                name: x.name,
                ...x.location!,
            })),
        serverNow: now,
        scoreMs: scoreAt(g, now),
        pushReady,
    };
}
/** All state-changing game rules are enforced here, never only in the UI. */
export function act(g: Game, m: Member, input: any, now: number) {
    if (input.version !== g.version) throw new GameError("conflict", 409);
    advance(g, now);
    const host = () => {
        if (m.id !== g.host) throw new GameError("host_only", 403);
    };
    const hider = () => {
        if (m.team !== g.hider) throw new GameError("hider_only", 403);
    };
    const seeker = () => {
        if (m.team === g.hider) throw new GameError("seeker_only", 403);
    };
    const active = () => {
        if (!["seeking", "endgame"].includes(g.phase) || g.pausedAt)
            throw new GameError("not_active");
    };
    const between = () => {
        if (!["lobby", "finished"].includes(g.phase))
            throw new GameError("round_running");
    };
    const pending = () => {
        const q = g.questions.find((q) => q.id === input.question);
        if (!q || q.status !== "waiting") throw new GameError("not_waiting");
        return q;
    };
    switch (input.op) {
        case "settings":
            host();
            between();
            {
                const next = g.teams.find((t) => t.id === input.hider);
                if (!next) throw new GameError("choose_team");
                if (next.id !== g.hider) {
                    g.cards = [];
                    g.privateNotes = "";
                    g.members.forEach((x) => delete x.location);
                }
                g.hider = next.id;
                g.hideMinutes = number(input.hideMinutes, 1, 180);
                g.tentacles = !!input.tentacles;
                g.rules =
                    typeof input.rules === "string"
                        ? input.rules.slice(0, 1500)
                        : "";
            }
            break;
        case "boundary":
            host();
            between();
            if (
                !Array.isArray(input.points) ||
                input.points.length < 3 ||
                input.points.length > 500
            )
                throw new GameError("boundary_required");
            g.boundary = input.points.map(point);
            break;
        case "start":
            host();
            between();
            if (g.boundary.length < 3) throw new GameError("boundary_required");
            if (g.phase === "finished") g.round++;
            g.phase = "hiding";
            g.hideEnd = now + g.hideMinutes * 60000;
            g.seekStart = g.hideEnd;
            g.scoredMs = 0;
            g.scoreAnchor = g.hideEnd;
            g.pausedAt = null;
            g.questions = [];
            g.marks = [];
            g.curses = [];
            g.cards = [];
            g.privateNotes = "";
            g.handLimit = 6;
            g.members.forEach((x) => delete x.location);
            emit(g, "hiding", "all", now);
            break;
        case "pause":
            host();
            active();
            g.pausedAt = now;
            emit(g, "paused", "all", now);
            break;
        case "resume":
            host();
            if (!g.pausedAt) throw new GameError("not_paused");
            {
                const elapsed = now - g.pausedAt;
                g.questions.forEach((q) => {
                    if (q.status === "waiting" && q.deadline)
                        q.deadline += elapsed;
                });
                g.curses.forEach((c) => {
                    if (c.until) c.until += elapsed;
                });
                g.pausedAt = null;
                g.scoreAnchor = now;
                emit(g, "resumed", "all", now);
            }
            break;
        case "endgame":
            hider();
            active();
            if (g.phase === "endgame") throw new GameError("already_endgame");
            g.phase = "endgame";
            emit(g, "endgame", "all", now);
            break;
        case "catch":
            host();
            active();
            {
                const bonus =
                    number(input.bonus ?? 0, 0, 1440) +
                    g.cards
                        .filter((c) => c.type === "time")
                        .reduce((s, c) => s + c.minutes, 0);
                g.scores.push({
                    team: g.hider,
                    round: g.round,
                    seconds: Math.floor(g.scoredMs / 1000),
                    bonusMinutes: bonus,
                });
                g.phase = "finished";
                g.pausedAt = null;
                g.members.forEach((x) => delete x.location);
                emit(g, "caught", "all", now);
            }
            break;
        case "ask":
            seeker();
            active();
            {
                if (g.questions.length >= 200)
                    throw new GameError("question_limit");
                if (
                    g.questions.some((q) =>
                        ["waiting", "travelling"].includes(q.status),
                    )
                )
                    throw new GameError("question_pending");
                if (
                    g.curses.some(
                        (c) => c.blocks && (!c.until || c.until > now),
                    )
                )
                    throw new GameError("curse_blocks");
                const spec = catalog.find((s) => s.id === input.spec);
                if (!spec || (spec.optional && !g.tentacles))
                    throw new GameError("invalid_question");
                const repeat =
                    1 + g.questions.filter((q) => q.spec === spec.id).length;
                if (repeat > 1 && input.confirmRepeat !== true)
                    throw new GameError("confirm_repeat");
                const start = input.start ? point(input.start) : undefined;
                if (["radar", "thermometer"].includes(spec.category) && !start)
                    throw new GameError("pin_required");
                const minutes = number(input.minutes ?? spec.minutes, 1, 60);
                const q = {
                    id: crypto.randomUUID(),
                    spec: spec.id,
                    team: m.team,
                    category: spec.category,
                    askedAt: now,
                    deadline:
                        spec.category === "thermometer"
                            ? null
                            : now + minutes * 60000,
                    minutes,
                    status:
                        spec.category === "thermometer"
                            ? ("travelling" as const)
                            : ("waiting" as const),
                    start,
                    distance: ["radar", "thermometer"].includes(spec.category)
                        ? number(input.distance ?? spec.distance, 1, 500000)
                        : undefined,
                    detail:
                        typeof input.detail === "string"
                            ? input.detail.trim().slice(0, 1500)
                            : "",
                    draw: spec.draw,
                    keep: spec.keep,
                    repeat,
                };
                g.questions.push(q);
                emit(
                    g,
                    spec.category === "thermometer" ? "travelling" : "question",
                    "hider",
                    now,
                    q.id,
                );
            }
            break;
        case "thermoEnd":
            seeker();
            active();
            {
                const q = g.questions.find((q) => q.id === input.question);
                if (!q || q.status !== "travelling" || !q.start)
                    throw new GameError("no_journey");
                const end = point(input.end);
                if (metres(q.start, end) < q.distance!)
                    throw new GameError("journey_short");
                q.end = end;
                q.deadline = now + q.minutes * 60000;
                q.status = "waiting";
                emit(g, "question", "hider", now, q.id);
            }
            break;
        case "answer":
        case "veto":
            hider();
            active();
            {
                const q = pending();
                q.answer =
                    input.op === "veto" ? "veto" : text(input.answer, 3000);
                q.status = input.op === "veto" ? "vetoed" : "answered";
                q.answeredAt = now;
                q.late = !!q.deadline && now > q.deadline;
                if (input.photo) q.photo = text(input.photo, 80);
                emit(
                    g,
                    q.late
                        ? "late_answer"
                        : input.op === "veto"
                          ? "veto"
                          : "answer",
                    "seekers",
                    now,
                    q.id,
                );
            }
            break;
        case "addCard":
            hider();
            if (g.phase === "finished") throw new GameError("round_finished");
            if (!["curse", "powerup", "time"].includes(input.type))
                throw new GameError("card_type");
            if (g.cards.length >= 30) throw new GameError("hand_full");
            g.cards.push({
                id: crypto.randomUUID(),
                name: text(input.name, 100),
                type: input.type,
                effect:
                    typeof input.effect === "string"
                        ? input.effect.slice(0, 1500)
                        : "",
                minutes: number(
                    input.minutes ?? 0,
                    0,
                    input.type === "time" ? 1440 : 240,
                ),
                blocks: input.type === "curse" && !!input.blocks,
            });
            break;
        case "discardCard":
            hider();
            g.cards = g.cards.filter((c) => c.id !== input.card);
            break;
        case "handLimit":
            hider();
            g.handLimit = number(input.limit, 1, 30);
            break;
        case "notes":
            hider();
            g.privateNotes =
                typeof input.text === "string" ? input.text.slice(0, 3000) : "";
            break;
        case "playCard":
            hider();
            active();
            {
                const c = g.cards.find((c) => c.id === input.card);
                if (!c) throw new GameError("card_missing");
                if (c.type === "time") throw new GameError("keep_bonus");
                if (input.confirmCost !== true)
                    throw new GameError("confirm_cost");
                if (c.type === "curse") {
                    if (
                        c.blocks &&
                        g.curses.some(
                            (x) => x.blocks && (!x.until || x.until > now),
                        )
                    )
                        throw new GameError("curse_blocks");
                    g.curses.push({
                        id: crypto.randomUUID(),
                        name: c.name,
                        effect: c.effect,
                        until: c.minutes ? now + c.minutes * 60000 : 0,
                        blocks: c.blocks,
                    });
                    emit(g, "curse", "all", now, undefined, c.name);
                } else emit(g, "powerup", "all", now, undefined, c.name);
                g.cards = g.cards.filter((x) => x.id !== c.id);
            }
            break;
        case "clearCurse":
            active();
            g.curses = g.curses.filter((c) => c.id !== input.curse);
            emit(g, "curse_ended", "all", now);
            break;
        case "mark":
            seeker();
            if (!["exclude", "circle", "pin"].includes(input.kind))
                throw new GameError("invalid_mark");
            if (g.marks.length >= 200) throw new GameError("mark_limit");
            if (
                !Array.isArray(input.points) ||
                input.points.length > 500 ||
                input.points.length < (input.kind === "exclude" ? 3 : 1)
            )
                throw new GameError("invalid_mark");
            g.marks.push({
                id: crypto.randomUUID(),
                kind: input.kind,
                points: input.points.map(point),
                radius:
                    input.kind === "circle"
                        ? number(input.radius, 1, 500000)
                        : undefined,
                label: text(input.label, 80),
                author: m.team,
            });
            break;
        case "removeMark":
            seeker();
            g.marks = g.marks.filter((x) => x.id !== input.mark);
            break;
        default:
            throw new GameError("unknown_action");
    }
    g.version++;
    g.updatedAt = now;
}
export function nextAlarm(g: Game, now: number) {
    const times = [
        g.phase === "hiding" ? g.hideEnd : 0,
        ...(!g.pausedAt
            ? g.questions
                  .filter((q) => q.status === "waiting" && !q.overdueNotified)
                  .map((q) => q.deadline || 0)
            : []),
        ...(!g.pausedAt ? g.curses.map((c) => c.until) : []),
    ].filter((t) => t > now);
    return times.length ? Math.min(...times) : null;
}
