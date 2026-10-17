import { persistentAtom } from "@nanostores/persistent";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { atom } from "nanostores";
import { z } from "zod";

import { mapGeoJSON, polyGeoJSON, questions } from "@/lib/context";
import { questionsSchema } from "@/maps/schema";

export const language = persistentAtom<"nb" | "en">("oslo-language", "nb");
export const osloBounds: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Oslo · byområdet" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [10.6, 59.84],
                        [10.9, 59.84],
                        [10.9, 60.01],
                        [10.6, 60.01],
                        [10.6, 59.84],
                    ],
                ],
            },
        },
    ],
};
const point = z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
]);
const ring = z
    .array(point)
    .min(4)
    .refine(
        (r) => r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1],
        "Ring must be closed",
    );
const polygon = z.array(ring).min(1);
const boundarySchema = z.object({
    type: z.literal("FeatureCollection"),
    features: z
        .array(
            z.object({
                type: z.literal("Feature"),
                properties: z.record(z.unknown()).nullable(),
                geometry: z.discriminatedUnion("type", [
                    z.object({
                        type: z.literal("Polygon"),
                        coordinates: polygon,
                    }),
                    z.object({
                        type: z.literal("MultiPolygon"),
                        coordinates: z.array(polygon).min(1),
                    }),
                ]),
            }),
        )
        .min(1)
        .max(100),
});
const sessionSchema = z.object({
    version: z.literal(1),
    questions: questionsSchema,
    boundary: boundarySchema,
});
export function exportSession() {
    // Allowlist: no hider position, API keys, URL data or other stores.
    return {
        version: 1,
        questions: questionsSchema.parse(questions.get()),
        boundary: polyGeoJSON.get() || osloBounds,
    };
}
export function parseSession(text: string) {
    if (text.length > 5_000_000) throw Error("File is too large");
    return sessionSchema.parse(JSON.parse(text));
}
export function applySession(session: ReturnType<typeof parseSession>) {
    batching = true;
    const boundary = session.boundary as FeatureCollection<
        Polygon | MultiPolygon
    >;
    polyGeoJSON.set(boundary);
    mapGeoJSON.set(boundary);
    questions.set(session.questions);
    batching = false;
    historyCommit();
}
export const historyState = atom({ undo: 0, redo: 0 });
let past: string[] = [],
    future: string[] = [],
    last = "",
    replaying = false;
let batching = false;
let historyCommit = () => {};
export function startHistory() {
    last = JSON.stringify(exportSession());
    const changed = () => {
        if (batching) return;
        const next = JSON.stringify(exportSession());
        if (next === last) return;
        if (!replaying) {
            past = [...past, last].slice(-60);
            future = [];
        }
        last = next;
        historyState.set({ undo: past.length, redo: future.length });
    };
    historyCommit = changed;
    const a = questions.listen(changed),
        b = polyGeoJSON.listen(changed);
    return () => {
        a();
        b();
        past = [];
        future = [];
        historyCommit = () => {};
    };
}
export function stepHistory(direction: "undo" | "redo") {
    const source = direction === "undo" ? past : future;
    const value = source.pop();
    if (!value) return;
    (direction === "undo" ? future : past).push(last);
    replaying = true;
    applySession(parseSession(value));
    replaying = false;
    last = JSON.stringify(exportSession());
    historyState.set({ undo: past.length, redo: future.length });
}
export type Mode = "metro" | "tram" | "bus" | "rail";
export type TransitLine = {
    id: string;
    code: string;
    name: string;
    mode: Mode;
    color: string;
    colorSource: string;
    destinations: string[];
    stopIds: string[];
    geometry: GeoJSON.MultiLineString;
};
export type TransitStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    lines: string[];
};
export type TransitData = {
    schemaVersion: number;
    fetchedAt: string;
    omittedPatterns: number;
    lines: TransitLine[];
    stops: TransitStop[];
};
export const transitData = atom<TransitData | null>(null);
export const transitError = atom(false);
export const selectedLine = atom<string | null>(null);
const json = { encode: JSON.stringify, decode: JSON.parse };
export const transitPrefs = persistentAtom<{
    modes: Record<Mode, boolean>;
    hidden: string[];
    opacity: number;
    stops: boolean;
}>(
    "oslo-transit",
    {
        modes: { metro: true, tram: true, bus: false, rail: true },
        hidden: [],
        opacity: 0.85,
        stops: false,
    },
    json,
);
export function lineVisible(line: TransitLine, prefs = transitPrefs.get()) {
    return prefs.modes[line.mode] && !prefs.hidden.includes(line.id);
}
export async function loadTransit() {
    transitError.set(false);
    try {
        const r = await fetch("/data/oslo-transit.json");
        if (!r.ok) throw Error("Snapshot unavailable");
        const data = await r.json();
        if (
            data.schemaVersion !== 1 ||
            !Array.isArray(data.lines) ||
            !Array.isArray(data.stops)
        )
            throw Error("Invalid snapshot");
        transitData.set(data);
    } catch {
        transitError.set(true);
    }
}
