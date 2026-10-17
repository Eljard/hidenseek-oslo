// Exercise the actual Worker + SQLite Durable Object, not an in-memory mock.
// Run `pnpm build` and `pnpm exec wrangler dev --local --port 8787` first.
import assert from "node:assert/strict";
const base = process.env.TEST_ORIGIN || "http://127.0.0.1:8787";
async function request(path, input, token, expected = 200) {
    const r = await fetch(base + path, {
        method: input === undefined ? "GET" : "POST",
        headers: {
            ...(input === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: input === undefined ? undefined : JSON.stringify(input),
    });
    const data = await r.json();
    assert.equal(r.status, expected, JSON.stringify(data));
    return data;
}
const host = await request(
        "/api/rooms",
        {
            name: "Local smoke test",
            player: "Hider",
            teams: ["Hide", "Seek"],
            hideMinutes: 1,
        },
        null,
        201,
    ),
    code = host.game.code,
    path = `/api/rooms/${code}`;
const seeker = await request(path + "/join", {
    name: "Seeker",
    team: host.game.teams[1].id,
});
await request(path, undefined, null, 401);
await request(
    path + "/location",
    { location: { point: [59.91, 10.75], accuracy: 20 } },
    host.token,
    403,
);
await request("/api/rooms", [], null, 400);
let state = await request(path, undefined, host.token);
async function action(op, input = {}, token = host.token, status = 200) {
    state = await request(path, undefined, token);
    const result = await request(
        path + "/action",
        { op, version: state.game.version, ...input },
        token,
        status,
    );
    if (status === 200) state = result;
    return result;
}
const ws = new WebSocket(base.replace("http", "ws") + path + "/socket");
const packets = [];
await new Promise((resolve, reject) => {
    ws.addEventListener("open", () =>
        ws.send(JSON.stringify({ token: seeker.token })),
    );
    ws.addEventListener("message", (e) => {
        packets.push(JSON.parse(e.data));
        resolve();
    });
    ws.addEventListener("error", reject);
    setTimeout(() => reject(Error("WebSocket timeout")), 5000).unref();
});
assert.equal(packets[0].me.hider, false);
await action("addCard", { name: "Private card", type: "time", minutes: 5 });
await action("notes", { text: "Private hider note" });
const seekView = await request(path, undefined, seeker.token);
assert.deepEqual(seekView.game.cards, []);
assert.equal(seekView.game.privateNotes, "");
assert.equal("host" in seekView.game, false);
assert.equal("members" in seekView.game, false);
await action("boundary", {
    points: [
        [59.8, 10.6],
        [60, 10.6],
        [60, 10.9],
    ],
});
await action("start");
const hideEnd = state.game.hideEnd;
console.log(
    "PASS: room membership, role privacy, input validation, WebSocket authentication, boundary and round start. Waiting for the real hiding alarm…",
);
while (Date.now() < hideEnd + 300) {
    await new Promise((r) =>
        setTimeout(r, Math.min(5000, hideEnd + 300 - Date.now())),
    );
}
state = await request(path, undefined, seeker.token);
assert.equal(state.game.phase, "seeking");
await action(
    "ask",
    { spec: "radar-0", start: [59.91, 10.75] },
    host.token,
    403,
);
await action("ask", { spec: "radar-0", start: [59.91, 10.75] }, seeker.token);
const q = state.game.questions.at(-1);
await action("answer", { question: q.id, answer: "yes" }, seeker.token, 403);
await action("answer", { question: q.id, answer: "yes" });
await request(path + "/action", { op: "pause", version: 1 }, host.token, 409);
await request(
    path + "/location",
    { location: { point: [59.912, 10.75], accuracy: 20 } },
    seeker.token,
);
const located = await request(path, undefined, host.token);
assert.equal(located.locations.length, 1);
assert.equal(located.locations[0].id, seeker.me.id);
await action("ask", { spec: "photo-0" }, seeker.token);
const photoQuestion = state.game.questions.at(-1);
const { readFile } = await import("node:fs/promises");
const jpeg = await readFile(
    new URL("../tests/fixtures/photo.jpg", import.meta.url),
);
const uploaded = await fetch(
    base + path + `/photo?question=${photoQuestion.id}`,
    {
        method: "POST",
        headers: {
            Authorization: `Bearer ${host.token}`,
            "Content-Type": "image/jpeg",
        },
        body: jpeg,
    },
).then((r) => r.json());
assert.ok(uploaded.photo);
await request(
    path + `/photo?id=${uploaded.photo}`,
    undefined,
    seeker.token,
    404,
);
await action("answer", {
    question: photoQuestion.id,
    answer: "photo",
    photo: uploaded.photo,
});
const image = await fetch(base + path + `/photo?id=${uploaded.photo}`, {
    headers: { Authorization: `Bearer ${seeker.token}` },
});
assert.equal(image.status, 200);
assert.equal(image.headers.get("content-type"), "image/jpeg");
assert.equal((await image.arrayBuffer()).byteLength, jpeg.length);
await request(path + `/photo?id=${uploaded.photo}`, undefined, null, 401);
await action("addCard", { name: "Bonus", type: "time", minutes: 5 });
await action("catch", { bonus: 2 });
assert.equal(state.game.phase, "finished");
assert.equal(state.game.scores[0].bonusMinutes, 7);
assert.deepEqual(state.locations, []);
await new Promise((r) => setTimeout(r, 150));
assert.ok(packets.some((p) => p.game.questions.length === 2));
assert.ok(
    packets.every(
        (p) => p.game.cards.length === 0 && p.game.privateNotes === "",
    ),
);
ws.close(1000, "Done");
console.log(
    "PASS: real hiding alarm, live broadcasts, seeker questions, hider answers, version conflicts, opt-in location, protected photo upload/read, catch and scoring.",
);
