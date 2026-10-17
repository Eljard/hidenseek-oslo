import * as turf from "@turf/turf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
    addQuestion,
    hiderMode,
    mapGeoJSON,
    polyGeoJSON,
    questionModified,
    questions,
} from "@/lib/context";
import { applyQuestionsToMapGeoData } from "@/maps";
import { questionSchema } from "@/maps/schema";
import {
    applySession,
    exportSession,
    historyState,
    lineVisible,
    loadTransit,
    osloBounds,
    parseSession,
    startHistory,
    stepHistory,
    transitData,
    transitError,
    transitPrefs,
} from "@/oslo/state";
import { clipShape, decodePolyline } from "../scripts/update-transit.mjs";

let stop = () => {};
beforeEach(() => {
    questions.set([]);
    polyGeoJSON.set(structuredClone(osloBounds));
    mapGeoJSON.set(polyGeoJSON.get());
    hiderMode.set(false);
    stop = startHistory();
});
afterEach(() => {
    stop();
    vi.unstubAllGlobals();
});
describe("Session and history", () => {
    test("undo restores the value before an in-place editor mutation", () => {
        addQuestion({
            id: "radius",
            data: { lat: 59.91, lng: 10.75, radius: 2 },
        });
        const q = questions.get()[0];
        if (q.id === "radius") q.data.radius = 3;
        questionModified();
        stepHistory("undo");
        expect((questions.get()[0].data as any).radius).toBe(2);
        stepHistory("redo");
        expect((questions.get()[0].data as any).radius).toBe(3);
    });
    test("export roundtrip excludes private hider coordinates", () => {
        hiderMode.set({ latitude: 59.99999, longitude: 10.99999 });
        const text = JSON.stringify(exportSession());
        expect(text).not.toContain("59.99999");
        expect(text).not.toContain("hider");
        expect(parseSession(text).boundary.features).toHaveLength(1);
    });
    test("rejects malformed and oversized imports before changing a game", () => {
        expect(() =>
            parseSession('{"version":1,"questions":[],"boundary":{}}'),
        ).toThrow();
        expect(() => parseSession("x".repeat(5_000_001))).toThrow();
        expect(questions.get()).toEqual([]);
    });
    test("boundary changes and imported questions undo as one action", () => {
        const next = structuredClone(osloBounds);
        next.features[0].properties!.name = "Custom";
        const q = questionSchema.parse({
            id: "radius",
            data: { lat: 59.9, lng: 10.75, radius: 1 },
        });
        applySession(
            parseSession(
                JSON.stringify({ version: 1, boundary: next, questions: [q] }),
            ),
        );
        expect(historyState.get().undo).toBe(1);
        stepHistory("undo");
        expect(questions.get()).toHaveLength(0);
        expect(polyGeoJSON.get()?.features[0].properties!.name).not.toBe(
            "Custom",
        );
    });
    test("clears redo after a new edit", () => {
        addQuestion({ id: "radius", data: { lat: 59.9, lng: 10.75 } });
        stepHistory("undo");
        addQuestion({ id: "radius", data: { lat: 59.92, lng: 10.72 } });
        expect(historyState.get().redo).toBe(0);
    });
});
describe("Spatial calculations and overlay isolation", () => {
    test("a 2 km radius in Oslo leaves about 12.6 square km", async () => {
        const q = questionSchema.parse({
            id: "radius",
            data: {
                lat: 59.9139,
                lng: 10.7522,
                radius: 2,
                unit: "kilometers",
                within: true,
            },
        });
        const result = await applyQuestionsToMapGeoData(
            [q],
            structuredClone(osloBounds),
            false,
        );
        expect(turf.area(result) / 1e6).toBeCloseTo(12.6, 0);
    });
    test("contradictory radius answers leave no possible area", async () => {
        const a = questionSchema.parse({
            id: "radius",
            data: {
                lat: 59.91,
                lng: 10.75,
                radius: 1,
                unit: "kilometers",
                within: true,
            },
        });
        const b = questionSchema.parse({
            id: "radius",
            data: {
                lat: 59.91,
                lng: 10.75,
                radius: 2,
                unit: "kilometers",
                within: false,
            },
        });
        const result = await applyQuestionsToMapGeoData(
            [a, b],
            structuredClone(osloBounds),
            false,
        );
        expect(result.features).toEqual([]);
    });
    test("transport settings cannot mutate questions or the play area", () => {
        const before = JSON.stringify(exportSession());
        for (const mode of ["metro", "tram", "bus", "rail"] as const) {
            const prefs = transitPrefs.get();
            transitPrefs.set({
                ...prefs,
                modes: { ...prefs.modes, [mode]: !prefs.modes[mode] },
            });
        }
        expect(JSON.stringify(exportSession())).toBe(before);
    });
    test("line filters respect both mode switches and individual visibility", () => {
        const line = { id: "RUT:Line:1", mode: "metro" } as any;
        const p = {
            modes: { metro: true, tram: true, bus: true, rail: true },
            hidden: [],
            opacity: 1,
            stops: false,
        };
        expect(lineVisible(line, p)).toBe(true);
        expect(
            lineVisible(line, { ...p, modes: { ...p.modes, metro: false } }),
        ).toBe(false);
        expect(lineVisible(line, { ...p, hidden: [line.id] })).toBe(false);
    });
});
describe("Network data", () => {
    test("all four modes and real Oslo stations are present", () => {
        const d = JSON.parse(
            readFileSync("public/data/oslo-transit.json", "utf8"),
        );
        for (const mode of ["metro", "tram", "bus", "rail"])
            expect(d.lines.some((l: any) => l.mode === mode)).toBe(true);
        expect(d.stops.some((s: any) => s.name === "Jernbanetorget")).toBe(
            true,
        );
        expect(
            d.lines
                .find((l: any) => l.code === "1" && l.mode === "metro")
                .geometry.coordinates.flat().length,
        ).toBeGreaterThan(100);
    });
    test("stop-to-stop only airport train shapes are explicitly omitted", () => {
        const d = JSON.parse(
            readFileSync("public/data/oslo-transit.json", "utf8"),
        );
        expect(d.lines.some((l: any) => l.id.startsWith("FLT:"))).toBe(false);
        expect(d.omittedPatterns).toBeGreaterThan(0);
        expect(d.lines.some((l: any) => l.id === "VYG:Line:L1")).toBe(true);
    });
    test("decodes geographic polylines in longitude/latitude order", () => {
        expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")[0]).toEqual([
            -120.2, 38.5,
        ]);
    });
    test("clipping preserves separate runs rather than joining gaps", () => {
        expect(
            clipShape([
                [10.7, 59.9],
                [10.71, 59.91],
                [12, 61],
                [13, 62],
                [10.8, 59.9],
                [10.81, 59.91],
            ]),
        ).toHaveLength(2);
    });
    test("unavailable data produces an explicit error state", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
        await loadTransit();
        expect(transitError.get()).toBe(true);
    });
    test("valid data can recover after a failed load", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({
                        schemaVersion: 1,
                        lines: [],
                        stops: [],
                    }),
                }),
        );
        await loadTransit();
        expect(transitError.get()).toBe(false);
        expect(transitData.get()?.lines).toEqual([]);
    });
});
