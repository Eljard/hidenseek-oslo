import { buildPushPayload } from "@block65/webcrypto-web-push";
import {
    GameError,
    type Game,
    type RoomEvent,
    type Subscription,
} from "../src/game/model";
import type { Env } from "./platform";
export function validSubscription(value: any): Subscription {
    let url: URL;
    try {
        url = new URL(value.endpoint);
    } catch {
        throw new GameError("invalid_subscription");
    }
    const host = url.hostname;
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !(
            host === "fcm.googleapis.com" ||
            host === "updates.push.services.mozilla.com" ||
            host.endsWith(".push.apple.com") ||
            host.endsWith(".notify.windows.com") ||
            host.endsWith(".wns.windows.com")
        )
    )
        throw new GameError("invalid_subscription");
    if (
        !/^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh || "") ||
        !/^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth || "")
    )
        throw new GameError("invalid_subscription");
    return {
        endpoint: url.toString(),
        expirationTime:
            typeof value.expirationTime === "number"
                ? value.expirationTime
                : null,
        keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
        language: value.language === "en" ? "en" : "nb",
    };
}
export const eventLabels: Record<string, [string, string]> = {
    question: ["Nytt spørsmål", "New question"],
    travelling: ["Varmere/kaldere startet", "Thermometer started"],
    answer: ["Svar mottatt", "Answer received"],
    late_answer: ["Sent svar · ingen kort", "Late answer · no cards"],
    veto: ["Spørsmål avvist", "Question vetoed"],
    deadline: ["Svarfristen er ute", "Answer overdue"],
    hiding: ["Gjemmetiden har startet", "Hiding time started"],
    seeking: ["Letingen har startet", "Seeking started"],
    paused: ["Spillet er satt på pause", "Game paused"],
    resumed: ["Spillet fortsetter", "Game resumed"],
    endgame: ["Sluttspillet har startet", "Endgame started"],
    caught: ["Gjemmeren er funnet", "Hider caught"],
    curse: ["Forbannelse spilt", "Curse played"],
    curse_ended: ["Forbannelsen er avsluttet", "Curse cleared"],
    powerup: ["Power-up spilt", "Power-up played"],
};
export function eventForMember(event: RoomEvent, game: Game, team: string) {
    return (
        event.audience === "all" ||
        (team === game.hider
            ? event.audience === "hider"
            : event.audience === "seekers")
    );
}
export async function deliverPush(game: Game, events: RoomEvent[], env: Env) {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
    const vapid = {
        subject: env.VAPID_SUBJECT || "https://hidenseek.vedin.workers.dev",
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
    };
    // Do not include answers, locations, card names, credentials or photo links on
    // lock screens. Each device receives only events permitted for its team.
    const work = game.members.flatMap((m) =>
        (m.subscriptions || []).flatMap((sub) =>
            events
                .filter(
                    (e) =>
                        eventForMember(e, game, m.team) && eventLabels[e.kind],
                )
                .map(async (e) => {
                    try {
                        const payload = await buildPushPayload(
                            {
                                data: JSON.stringify({
                                    title: game.name,
                                    body: eventLabels[e.kind][
                                        sub.language === "en" ? 1 : 0
                                    ],
                                    tag: `${game.code}-${e.seq}`,
                                    url: `/?room=${game.code}#game`,
                                    event: e.seq,
                                    room: game.code,
                                }),
                                options: { ttl: 300 },
                            },
                            {
                                ...sub,
                                expirationTime: sub.expirationTime ?? null,
                            },
                            vapid,
                        );
                        const response = await fetch(sub.endpoint, {
                            ...payload,
                            redirect: "error",
                            signal: AbortSignal.timeout(10000),
                        });
                        return response.status === 404 ||
                            response.status === 410
                            ? sub.endpoint
                            : null;
                    } catch {
                        return null;
                    }
                }),
        ),
    );
    return (await Promise.all(work)).filter((v): v is string => !!v);
}
