import { describe, expect, it } from "vitest";
import { catalog } from "../src/game/catalog";
import {
    act,
    advance,
    createGame,
    emit,
    nextAlarm,
    scoreAt,
    view,
} from "../src/game/engine";
import type { Game, Member } from "../src/game/model";
import { eventForMember, validSubscription } from "../worker/push";

const start = 1_800_000_000_000;
function fixture() {
    const host: Member = {
        id: "host",
        name: "Host",
        tokenHash: "secret hash",
        team: "",
        joined: start,
    };
    const g = createGame(
        "abcdefgh23",
        { name: "Oslo", teams: ["Hiders", "Seekers"], hideMinutes: 1 },
        host,
        start,
    );
    const seeker: Member = {
        id: "seeker",
        name: "Seeker",
        tokenHash: "another hash",
        team: g.teams[1].id,
        joined: start,
    };
    g.members.push(seeker);
    return { g, host, seeker };
}
function send(
    g: Game,
    m: Member,
    op: string,
    now: number,
    input: Record<string, unknown> = {},
) {
    const copy = structuredClone(g);
    act(copy, m, { version: g.version, op, ...input }, now);
    Object.assign(g, copy);
}
function playing() {
    const f = fixture();
    send(f.g, f.host, "boundary", start, {
        points: [
            [59.8, 10.6],
            [60, 10.6],
            [60, 10.9],
        ],
    });
    send(f.g, f.host, "start", start);
    advance(f.g, start + 60000);
    return { ...f, now: start + 60000 };
}
function ask(
    f: ReturnType<typeof playing>,
    now = f.now,
    input: Record<string, unknown> = {},
) {
    send(f.g, f.seeker, "ask", now, {
        spec: "radar-0",
        start: [59.91, 10.75],
        ...input,
    });
    return f.g.questions.at(-1)!;
}

describe("shared game rules", () => {
    it("has the reference small-game catalogue and optional tentacles", () => {
        expect(catalog.filter((q) => !q.optional)).toHaveLength(58);
        expect(catalog.filter((q) => q.optional)).toHaveLength(4);
        expect(
            catalog
                .filter((q) => q.category === "photo")
                .every((q) => q.minutes === 10),
        ).toBe(true);
    });
    it("rejects duplicate team names", () => {
        const { host } = fixture();
        expect(() =>
            createGame(
                "a",
                { name: "x", teams: ["Team", "team"] },
                host,
                start,
            ),
        ).toThrow("unique_teams");
    });
    it("requires a boundary and host to start", () => {
        const { g, host, seeker } = fixture();
        expect(() => send(g, seeker, "start", start)).toThrow("host_only");
        expect(() => send(g, host, "start", start)).toThrow(
            "boundary_required",
        );
    });
    it("starts seeking automatically and schedules its alarm", () => {
        const { g, host } = fixture();
        send(g, host, "boundary", start, {
            points: [
                [59, 10],
                [60, 10],
                [60, 11],
            ],
        });
        send(g, host, "start", start);
        expect(nextAlarm(g, start)).toBe(start + 60000);
        expect(advance(g, start + 61000)).toBe(true);
        expect(g.phase).toBe("seeking");
        expect(scoreAt(g, start + 62000)).toBe(2000);
        expect(g.events.filter((e) => e.kind === "seeking")).toHaveLength(1);
    });
    it("permits one active question and only seekers can ask", () => {
        const f = playing();
        expect(() =>
            send(f.g, f.host, "ask", f.now, {
                spec: "radar-0",
                start: [59, 10],
            }),
        ).toThrow("seeker_only");
        ask(f);
        expect(() => ask(f)).toThrow("question_pending");
    });
    it("requires map pins and explicit repeat confirmation", () => {
        const f = playing();
        expect(() => ask(f, f.now, { start: undefined })).toThrow(
            "pin_required",
        );
        const q = ask(f);
        send(f.g, f.host, "answer", f.now + 1000, {
            question: q.id,
            answer: "yes",
        });
        expect(() => ask(f, f.now + 2000)).toThrow("confirm_repeat");
        const next = ask(f, f.now + 2000, { confirmRepeat: true });
        expect([next.draw, next.keep, next.repeat]).toEqual([2, 1, 2]);
    });
    it("prevents seeker answers and rejects stale writes", () => {
        const f = playing(),
            q = ask(f);
        expect(() =>
            send(f.g, f.seeker, "answer", f.now, {
                question: q.id,
                answer: "yes",
            }),
        ).toThrow("hider_only");
        expect(() =>
            act(
                structuredClone(f.g),
                f.host,
                { op: "pause", version: f.g.version - 1 },
                f.now,
            ),
        ).toThrow("conflict");
    });
    it("freezes score at a late answer deadline then resumes without counting the delay", () => {
        const f = playing(),
            q = ask(f);
        advance(f.g, f.now + 400000);
        expect(scoreAt(f.g, f.now + 500000)).toBe(300000);
        expect(f.g.events.filter((e) => e.kind === "deadline")).toHaveLength(1);
        advance(f.g, f.now + 500000);
        expect(f.g.events.filter((e) => e.kind === "deadline")).toHaveLength(1);
        send(f.g, f.host, "answer", f.now + 600000, {
            question: q.id,
            answer: "yes",
        });
        expect(f.g.questions[0].late).toBe(true);
        expect(scoreAt(f.g, f.now + 660000)).toBe(360000);
    });
    it("pauses score and shifts deadlines by exactly the pause duration", () => {
        const f = playing(),
            q = ask(f);
        send(f.g, f.host, "pause", f.now + 60000);
        expect(scoreAt(f.g, f.now + 900000)).toBe(60000);
        expect(nextAlarm(f.g, f.now + 60000)).toBeNull();
        send(f.g, f.host, "resume", f.now + 180000);
        expect(f.g.questions[0].deadline).toBe(q.askedAt + 420000);
        expect(scoreAt(f.g, f.now + 240000)).toBe(120000);
    });
    it("requires thermometer travel before the answer timer starts", () => {
        const f = playing(),
            q = ask(f, f.now, { spec: "thermometer-0", distance: 500 });
        expect(q.deadline).toBeNull();
        expect(() =>
            send(f.g, f.host, "answer", f.now, {
                question: q.id,
                answer: "warmer",
            }),
        ).toThrow("not_waiting");
        expect(() =>
            send(f.g, f.seeker, "thermoEnd", f.now, {
                question: q.id,
                end: [59.9101, 10.75],
            }),
        ).toThrow("journey_short");
        send(f.g, f.seeker, "thermoEnd", f.now + 120000, {
            question: q.id,
            end: [59.92, 10.75],
        });
        expect(f.g.questions[0].deadline).toBe(f.now + 420000);
    });
    it("keeps tentacles optional", () => {
        const f = playing();
        expect(() => ask(f, f.now, { spec: "tentacle-0" })).toThrow(
            "invalid_question",
        );
    });
    it("enforces card casting cost and question-blocking curses", () => {
        const f = playing();
        send(f.g, f.host, "addCard", f.now, {
            name: "Stop",
            type: "curse",
            minutes: 1,
            blocks: true,
        });
        const card = f.g.cards[0];
        expect(() =>
            send(f.g, f.host, "playCard", f.now, { card: card.id }),
        ).toThrow("confirm_cost");
        send(f.g, f.host, "playCard", f.now, {
            card: card.id,
            confirmCost: true,
        });
        expect(f.g.cards).toHaveLength(0);
        expect(() => ask(f)).toThrow("curse_blocks");
        advance(f.g, f.now + 61000);
        expect(f.g.curses).toHaveLength(0);
        expect(() => ask(f, f.now + 62000)).not.toThrow();
    });
    it("adds held time bonuses on catch and clears round state for the next hider", () => {
        const f = playing();
        send(f.g, f.host, "addCard", f.now, {
            name: "Bonus",
            type: "time",
            minutes: 5,
        });
        send(f.g, f.host, "catch", f.now + 90000, { bonus: 2 });
        expect(f.g.scores[0]).toMatchObject({ seconds: 90, bonusMinutes: 7 });
        send(f.g, f.host, "settings", f.now + 91000, {
            hider: f.seeker.team,
            hideMinutes: 1,
        });
        send(f.g, f.host, "start", f.now + 92000);
        expect(f.g.round).toBe(2);
        expect(f.g.cards).toHaveLength(0);
        expect(f.g.scores).toHaveLength(1);
    });
    it("filters private hands, notes, events, locations and token hashes from server views", () => {
        const f = playing();
        send(f.g, f.host, "addCard", f.now, {
            name: "Secret card",
            type: "curse",
        });
        send(f.g, f.host, "notes", f.now, { text: "Secret strategy" });
        send(f.g, f.seeker, "mark", f.now, {
            kind: "pin",
            points: [[59, 10]],
            label: "Seeker note",
        });
        emit(f.g, "question", "hider", f.now);
        f.g.members.find((m) => m.id === f.host.id)!.location = {
            point: [59, 10],
            accuracy: 2,
            at: f.now,
        };
        f.g.members.find((m) => m.id === f.seeker.id)!.location = {
            point: [59, 11],
            accuracy: 4,
            at: f.now,
        };
        f.g.host = f.seeker.id;
        const s = view(f.g, f.seeker, f.now),
            h = view(f.g, f.host, f.now);
        expect(s.me.host).toBe(true);
        expect(s.game.cards).toEqual([]);
        expect(s.game.privateNotes).toBe("");
        expect(s.game.events.some((e) => e.kind === "question")).toBe(false);
        expect(h.game.cards).toHaveLength(1);
        expect(h.game.marks).toEqual([]);
        expect(s.locations.map((l) => l.id)).toEqual(["seeker"]);
        expect(JSON.stringify(s)).not.toMatch(
            /tokenHash|secret hash|Secret strategy|Secret card/,
        );
        expect(view(f.g, f.seeker, f.now + 300001).locations).toHaveLength(0);
    });
    it("does not change authoritative state after an invalid request", () => {
        const f = playing();
        const before = structuredClone(f.g);
        expect(() =>
            send(f.g, f.seeker, "settings", f.now + 50000, {}),
        ).toThrow("host_only");
        expect(f.g).toEqual(before);
    });
});

describe("notification boundaries", () => {
    it("only sends role-specific events to the appropriate team", () => {
        const { g, host, seeker } = fixture();
        const e = {
            seq: 1,
            at: start,
            kind: "question",
            audience: "hider" as const,
        };
        expect(eventForMember(e, g, host.team)).toBe(true);
        expect(eventForMember(e, g, seeker.team)).toBe(false);
    });
    it("rejects arbitrary endpoints and credentials in push URLs", () => {
        const s = {
            keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
            language: "en",
        };
        expect(() =>
            validSubscription({
                ...s,
                endpoint: "https://example.com/private",
            }),
        ).toThrow("invalid_subscription");
        expect(() =>
            validSubscription({
                ...s,
                endpoint: "https://user:secret@fcm.googleapis.com/x",
            }),
        ).toThrow();
        expect(
            validSubscription({
                ...s,
                endpoint: "https://fcm.googleapis.com/fcm/send/test",
            }).language,
        ).toBe("en");
    });
});
