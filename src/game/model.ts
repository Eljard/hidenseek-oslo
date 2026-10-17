import type { Category } from "./catalog";
export type Point = [number, number]; // latitude, longitude
export type Phase = "lobby" | "hiding" | "seeking" | "endgame" | "finished";
export type Team = { id: string; name: string; color: string };
export type Asked = {
    id: string;
    spec: string;
    team: string;
    category: Category;
    askedAt: number;
    deadline: number | null;
    minutes: number;
    status: "travelling" | "waiting" | "answered" | "vetoed";
    start?: Point;
    end?: Point;
    distance?: number;
    detail: string;
    draw: number;
    keep: number;
    repeat: number;
    answeredAt?: number;
    answer?: string;
    photo?: string;
    late?: boolean;
    overdueNotified?: boolean;
};
export type Card = {
    id: string;
    name: string;
    type: "curse" | "powerup" | "time";
    effect: string;
    minutes: number;
    blocks: boolean;
};
export type Curse = {
    id: string;
    name: string;
    effect: string;
    until: number;
    blocks: boolean;
};
export type Mark = {
    id: string;
    kind: "pin" | "exclude" | "circle";
    points: Point[];
    radius?: number;
    label: string;
    author: string;
};
export type RoomEvent = {
    seq: number;
    at: number;
    kind: string;
    audience: "all" | "hider" | "seekers";
    question?: string;
    title?: string;
};
export type Member = {
    id: string;
    tokenHash: string;
    name: string;
    team: string;
    joined: number;
    location?: { point: Point; accuracy: number; at: number };
    subscriptions?: Subscription[];
};
export type Subscription = {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
    language: "nb" | "en";
};
export type Game = {
    code: string;
    name: string;
    version: number;
    host: string;
    teams: Team[];
    hider: string;
    phase: Phase;
    round: number;
    hideMinutes: number;
    hideEnd: number;
    seekStart: number;
    pausedAt: number | null;
    scoredMs: number;
    scoreAnchor: number;
    boundary: Point[];
    questions: Asked[];
    marks: Mark[];
    cards: Card[];
    handLimit: number;
    privateNotes: string;
    curses: Curse[];
    tentacles: boolean;
    rules: string;
    scores: {
        team: string;
        round: number;
        seconds: number;
        bonusMinutes: number;
    }[];
    events: RoomEvent[];
    eventSeq: number;
    members: Member[];
    createdAt: number;
    updatedAt: number;
};
export type RoomView = {
    game: Omit<Game, "members" | "host">;
    me: { id: string; team: string; host: boolean; hider: boolean };
    members: { id: string; team: string; name: string }[];
    locations: {
        id: string;
        team: string;
        name: string;
        point: Point;
        accuracy: number;
        at: number;
    }[];
    serverNow: number;
    scoreMs: number;
    pushReady: boolean;
};
export class GameError extends Error {
    constructor(
        public code: string,
        public status = 400,
    ) {
        super(code);
    }
}
