import { createECDH, randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createGame } from "../src/game/engine";
import { deliverPush } from "../worker/push";
import type { Env } from "../worker/platform";

it("encrypts role-filtered Web Push messages and removes expired endpoints", async () => {
    const vapid = createECDH("prime256v1"),
        device = createECDH("prime256v1");
    vapid.generateKeys();
    device.generateKeys();
    const host = {
        id: "h",
        name: "Hider",
        team: "",
        tokenHash: "private-auth",
        joined: 1000,
    };
    const g = createGame(
        "abcdefgh23",
        { name: "Test game", teams: ["Hide", "Seek"] },
        host,
        1000,
    );
    const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-test",
        expirationTime: null,
        language: "en" as const,
        keys: {
            p256dh: device.getPublicKey().toString("base64url"),
            auth: randomBytes(16).toString("base64url"),
        },
    };
    g.members[0].subscriptions = [subscription];
    g.members.push({
        id: "s",
        name: "Seeker",
        team: g.teams[1].id,
        tokenHash: "private-auth-2",
        joined: 1000,
        subscriptions: [
            { ...subscription, endpoint: subscription.endpoint + "-seek" },
        ],
    });
    const mocked = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 410 }));
    try {
        const stale = await deliverPush(
            g,
            [
                {
                    seq: 1,
                    at: 1000,
                    kind: "question",
                    audience: "hider",
                    title: "Private card title",
                },
            ],
            {
                VAPID_PUBLIC_KEY: vapid.getPublicKey().toString("base64url"),
                VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString("base64url"),
            } as Env,
        );
        expect(mocked).toHaveBeenCalledTimes(1);
        expect(stale).toEqual([subscription.endpoint]);
        const [url, options] = mocked.mock.calls[0];
        expect(url).toBe(subscription.endpoint);
        const headers = new Headers(options!.headers);
        expect(headers.get("content-encoding")).toBe("aes128gcm");
        expect(headers.get("authorization")).toContain("vapid");
        expect(
            Buffer.from(options!.body as ArrayBuffer).toString(),
        ).not.toMatch(/New question|Private card|private-auth/);
    } finally {
        mocked.mockRestore();
    }
});
