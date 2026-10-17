import {
    act,
    advance,
    createGame,
    nextAlarm,
    number,
    point,
    text,
    view,
} from "../src/game/engine";
import { GameError, type Game, type Member } from "../src/game/model";
import type { Env, RoomState, Socket } from "./platform";
import { deliverPush, validSubscription } from "./push";

declare const WebSocketPair: new () => { 0: Socket; 1: Socket };
const json = (data: unknown, status = 200) =>
    Response.json(data, {
        status,
        headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
const token = () => {
    const a = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...a))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
};
async function hash(value: string) {
    return Array.from(
        new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(value),
            ),
        ),
    )
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
}
async function bytes(request: Request, limit: number) {
    if (Number(request.headers.get("content-length") || 0) > limit)
        throw new GameError("request_large", 413);
    const reader = request.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new GameError("request_large", 413);
        }
        chunks.push(result.value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
    }
    return all;
}
async function body(request: Request) {
    try {
        const value = JSON.parse(
            new TextDecoder().decode(await bytes(request, 64000)),
        );
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new GameError("invalid_json");
        return value;
    } catch (e) {
        if (e instanceof GameError) throw e;
        throw new GameError("invalid_json");
    }
}
function fail(error: unknown) {
    if (!(error instanceof GameError)) console.error(error);
    return error instanceof GameError
        ? json({ error: error.code }, error.status)
        : json({ error: "server_error" }, 500);
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
        try {
            const origin = request.headers.get("origin");
            if (origin && origin !== url.origin)
                throw new GameError("invalid_origin", 403);
            if (url.pathname === "/api/config")
                return json({ pushKey: env.VAPID_PUBLIC_KEY || null });
            if (url.pathname === "/api/rooms" && request.method === "POST") {
                const input = await body(request),
                    code = Array.from(
                        crypto.getRandomValues(new Uint8Array(10)),
                    )
                        .map((n) => "abcdefghjkmnpqrstuvwxyz23456789"[n % 29])
                        .join("");
                const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
                return await stub.fetch(
                    new Request(`https://room/create`, {
                        method: "POST",
                        body: JSON.stringify({ ...input, code }),
                    }),
                );
            }
            const match = url.pathname.match(
                /^\/api\/rooms\/([a-z2-9]{10})(?:\/(lookup|join|action|socket|location|subscribe|unsubscribe|photo))?$/,
            );
            if (!match) throw new GameError("not_found", 404);
            const stub = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
            const target = new URL(request.url);
            target.pathname = "/" + (match[2] || "state");
            // Finish reading the caller's bounded body before crossing the
            // Durable Object RPC boundary, including requests rejected by role.
            const payload =
                request.method === "GET" || request.method === "HEAD"
                    ? undefined
                    : await bytes(
                          request,
                          match[2] === "photo" ? 1000000 : 64000,
                      );
            return await stub.fetch(
                new Request(target, {
                    method: request.method,
                    headers: request.headers,
                    body: payload,
                }),
            );
        } catch (error) {
            return fail(error);
        }
    },
};

export class GameRoom {
    private game: Game | undefined;
    private ready: Promise<void>;
    constructor(
        private ctx: RoomState,
        private env: Env,
    ) {
        this.ready = ctx.blockConcurrencyWhile(async () => {
            this.game = await ctx.storage.get<Game>("room");
            ctx.storage.sql.exec(
                "CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, question TEXT UNIQUE, data BLOB NOT NULL, mime TEXT NOT NULL)",
            );
        });
    }
    private pushReady() {
        return !!(this.env.VAPID_PRIVATE_KEY && this.env.VAPID_PUBLIC_KEY);
    }
    private async authenticate(request: Request) {
        const credential = request.headers
            .get("authorization")
            ?.replace(/^Bearer /, "");
        if (!credential || credential.length !== 43)
            throw new GameError("join_first", 401);
        const digest = await hash(credential);
        const m = this.game?.members.find((m) => m.tokenHash === digest);
        if (!m) throw new GameError("join_first", 403);
        return m;
    }
    private snapshot(member: Member) {
        return view(this.game!, member, Date.now(), this.pushReady());
    }
    private async save(next: Game, previousSeq: number) {
        const events = next.events.filter((e) => e.seq > previousSeq);
        await this.ctx.storage.put("room", next);
        this.game = next;
        const alarm = nextAlarm(next, Date.now());
        if (alarm) await this.ctx.storage.setAlarm(alarm);
        else await this.ctx.storage.deleteAlarm();
        this.broadcast();
        if (events.length)
            this.ctx.waitUntil(
                deliverPush(structuredClone(next), events, this.env).then(
                    async (stale) => {
                        if (!stale?.length) return;
                        await this.ctx.blockConcurrencyWhile(async () => {
                            if (!this.game) return;
                            for (const m of this.game.members)
                                m.subscriptions = m.subscriptions?.filter(
                                    (s) => !stale.includes(s.endpoint),
                                );
                            await this.ctx.storage.put("room", this.game);
                        });
                    },
                ),
            );
    }
    private broadcast() {
        if (!this.game) return;
        for (const socket of this.ctx.getWebSockets()) {
            const id = socket.deserializeAttachment()?.member;
            const m = this.game.members.find((m) => m.id === id);
            if (!m) continue;
            try {
                socket.send(
                    JSON.stringify({ type: "state", ...this.snapshot(m) }),
                );
            } catch {
                socket.close(1001, "Disconnected");
            }
        }
    }
    async fetch(request: Request) {
        await this.ready;
        return this.ctx.blockConcurrencyWhile(async () => {
            try {
                return await this.route(request);
            } catch (error) {
                return fail(error);
            }
        });
    }
    private async route(request: Request): Promise<Response> {
        const url = new URL(request.url),
            now = Date.now();
        if (url.pathname === "/create" && request.method === "POST") {
            if (this.game) throw new GameError("room_exists", 409);
            const input = await body(request),
                credential = token(),
                m: Member = {
                    id: crypto.randomUUID(),
                    tokenHash: await hash(credential),
                    name: text(input.player, 40),
                    team: "",
                    joined: now,
                };
            const next = createGame(input.code, input, m, now);
            await this.save(next, 0);
            return json({ ...this.snapshot(m), token: credential }, 201);
        }
        if (!this.game) throw new GameError("room_missing", 404);
        if (url.pathname === "/lookup" && request.method === "GET")
            return json({
                code: this.game.code,
                name: this.game.name,
                teams: this.game.teams,
                phase: this.game.phase,
            });
        if (url.pathname === "/join" && request.method === "POST") {
            const input = await body(request),
                team = this.game.teams.find((t) => t.id === input.team);
            if (!team) throw new GameError("choose_team");
            const auth = request.headers.get("authorization");
            let member: Member | undefined;
            if (auth) member = await this.authenticate(request);
            const next = structuredClone(this.game);
            let credential: string | undefined;
            if (member) {
                if (
                    !["lobby", "finished"].includes(next.phase) &&
                    member.team !== team.id
                )
                    throw new GameError("team_locked");
                member = next.members.find((m) => m.id === member!.id)!;
                member.team = team.id;
                delete member.location;
            } else {
                if (next.members.length >= 100)
                    throw new GameError("room_full");
                credential = token();
                member = {
                    id: crypto.randomUUID(),
                    tokenHash: await hash(credential),
                    name: text(input.name, 40),
                    team: team.id,
                    joined: now,
                };
                next.members.push(member);
            }
            next.version++;
            await this.save(next, next.eventSeq);
            return json({
                ...this.snapshot(member),
                ...(credential ? { token: credential } : {}),
            });
        }
        if (url.pathname === "/socket") {
            if (request.headers.get("upgrade") !== "websocket")
                throw new GameError("websocket_required", 426);
            if (this.ctx.getWebSockets().length >= 120)
                throw new GameError("room_full", 429);
            const pair = new WebSocketPair();
            this.ctx.acceptWebSocket(pair[1]);
            return new Response(null, {
                status: 101,
                webSocket: pair[0],
            } as ResponseInit);
        }
        const member = await this.authenticate(request);
        if (url.pathname === "/state" && request.method === "GET") {
            const next = structuredClone(this.game),
                seq = next.eventSeq;
            if (advance(next, now)) {
                next.version++;
                await this.save(next, seq);
            }
            return json(this.snapshot(member));
        }
        if (url.pathname === "/location" && request.method === "POST") {
            if (member.team === this.game.hider)
                throw new GameError("hider_location", 403);
            const input = await body(request),
                next = structuredClone(this.game),
                m = next.members.find((m) => m.id === member.id)!;
            if (input.location) {
                if (!["seeking", "endgame"].includes(next.phase))
                    throw new GameError("not_active");
                if (m.location && now - m.location.at < 7500)
                    throw new GameError("location_rate", 429);
                m.location = {
                    point: point(input.location.point),
                    accuracy: number(input.location.accuracy, 0, 100000),
                    at: now,
                };
            } else delete m.location;
            await this.save(next, next.eventSeq);
            return json({ ok: true });
        }
        if (
            ["/subscribe", "/unsubscribe"].includes(url.pathname) &&
            request.method === "POST"
        ) {
            if (!this.pushReady()) throw new GameError("push_unavailable", 503);
            const input = await body(request),
                next = structuredClone(this.game),
                m = next.members.find((m) => m.id === member.id)!;
            if (url.pathname === "/subscribe") {
                const sub = validSubscription(input);
                m.subscriptions = [
                    ...(m.subscriptions || []).filter(
                        (s) => s.endpoint !== sub.endpoint,
                    ),
                    sub,
                ].slice(-3);
            } else
                m.subscriptions = (m.subscriptions || []).filter(
                    (s) => s.endpoint !== input.endpoint,
                );
            await this.save(next, next.eventSeq);
            return json({ ok: true });
        }
        if (url.pathname === "/photo") {
            if (request.method === "POST") {
                if (member.team !== this.game.hider)
                    throw new GameError("hider_only", 403);
                const q = this.game.questions.find(
                    (q) =>
                        q.id === url.searchParams.get("question") &&
                        q.category === "photo" &&
                        q.status === "waiting",
                );
                if (!q) throw new GameError("not_waiting");
                if (request.headers.get("content-type") !== "image/jpeg")
                    throw new GameError("photo_type");
                const data = await bytes(request, 1000000);
                if (data[0] !== 255 || data[1] !== 216 || data[2] !== 255)
                    throw new GameError("photo_type");
                const id = crypto.randomUUID();
                this.ctx.storage.sql.exec(
                    "INSERT INTO evidence(id,question,data,mime) VALUES(?,?,?,?) ON CONFLICT(question) DO UPDATE SET id=excluded.id,data=excluded.data,mime=excluded.mime",
                    id,
                    q.id,
                    data.buffer as ArrayBuffer,
                    "image/jpeg",
                );
                return json({ photo: id });
            }
            if (request.method === "GET") {
                const id = url.searchParams.get("id") || "";
                const q = this.game.questions.find(
                    (q) => q.photo === id && q.status === "answered",
                );
                if (!q) throw new GameError("photo_missing", 404);
                const row = [
                    ...this.ctx.storage.sql.exec<{
                        data: ArrayBuffer;
                        mime: string;
                    }>(
                        "SELECT data,mime FROM evidence WHERE id=? AND question=?",
                        id,
                        q.id,
                    ),
                ][0];
                if (!row) throw new GameError("photo_missing", 404);
                return new Response(row.data, {
                    headers: {
                        "Content-Type": row.mime,
                        "Cache-Control": "no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                });
            }
        }
        if (url.pathname === "/action" && request.method === "POST") {
            const input = await body(request);
            if (input.photo) {
                const found = [
                    ...this.ctx.storage.sql.exec(
                        "SELECT id FROM evidence WHERE id=? AND question=?",
                        text(input.photo, 80),
                        text(input.question, 80),
                    ),
                ];
                if (!found.length) throw new GameError("photo_missing");
            }
            const next = structuredClone(this.game),
                seq = next.eventSeq;
            act(next, member, input, now);
            await this.save(next, seq);
            if (input.op === "start")
                this.ctx.storage.sql.exec("DELETE FROM evidence");
            return json(
                this.snapshot(next.members.find((m) => m.id === member.id)!),
            );
        }
        throw new GameError("not_found", 404);
    }
    async alarm() {
        await this.ready;
        await this.ctx.blockConcurrencyWhile(async () => {
            if (!this.game) return;
            const next = structuredClone(this.game),
                seq = next.eventSeq;
            advance(next, Date.now());
            next.version++;
            await this.save(next, seq);
        });
    }
    async webSocketMessage(socket: Socket, message: string | ArrayBuffer) {
        await this.ready;
        try {
            if (typeof message !== "string" || message.length > 512)
                throw new GameError("invalid_message");
            const data = JSON.parse(message);
            if (!this.game) throw new GameError("room_missing");
            let id = socket.deserializeAttachment()?.member;
            if (!id) {
                if (typeof data.token !== "string" || data.token.length !== 43)
                    throw new GameError("join_first");
                const digest = await hash(data.token);
                const m = this.game.members.find((m) => m.tokenHash === digest);
                if (!m) throw new GameError("join_first");
                id = m.id;
                socket.serializeAttachment({ member: id });
            }
            const m = this.game.members.find((m) => m.id === id);
            if (!m) throw new GameError("join_first");
            socket.send(JSON.stringify({ type: "state", ...this.snapshot(m) }));
        } catch {
            socket.close(1008, "Authentication required");
        }
    }
    webSocketClose(socket: Socket, code: number, reason: string) {
        // Abnormal disconnects report reserved codes that cannot be echoed.
        const reply = [1005, 1006, 1015].includes(code) ? 1000 : code;
        try {
            socket.close(reply, reason);
        } catch {
            /* Already closed. */
        }
    }
    webSocketError(socket: Socket) {
        socket.close(1011, "Reconnect");
    }
}
