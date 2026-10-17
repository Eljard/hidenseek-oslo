/** Official Entur geographic shapes; no schematic or invented geometry. */
import { mkdir, writeFile, rename } from "node:fs/promises";
import { simplify, lineString, distance } from "@turf/turf";
const endpoint = "https://api.entur.io/journey-planner/v3/graphql";
const bounds = [10.35, 59.7, 11.15, 60.15];
const inside = ([lng, lat]) =>
    lng >= bounds[0] &&
    lng <= bounds[2] &&
    lat >= bounds[1] &&
    lat <= bounds[3];
const colors = {
    metro: "#e47716",
    tram: "#208ab0",
    bus: "#c84453",
    rail: "#358560",
};
async function query(query, variables = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "ET-Client-Name": "eljard-hidenseek-oslo",
                },
                body: JSON.stringify({ query, variables }),
                signal: AbortSignal.timeout(60000),
            });
            const result = await r.json();
            if (!r.ok || result.errors)
                throw new Error(JSON.stringify(result.errors || r.status));
            return result.data;
        } catch (e) {
            if (attempt === 2) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
}
export function decodePolyline(encoded) {
    const out = [];
    let i = 0,
        lat = 0,
        lng = 0;
    while (i < encoded.length) {
        const next = () => {
            let result = 0,
                shift = 0,
                b;
            do {
                b = encoded.charCodeAt(i++) - 63;
                result |= (b & 31) << shift;
                shift += 5;
            } while (b >= 32);
            return result & 1 ? ~(result >> 1) : result >> 1;
        };
        lat += next();
        lng += next();
        out.push([lng / 1e5, lat / 1e5]);
    }
    return out;
}
export function clipShape(points, maxGapKm = Infinity) {
    const runs = [];
    let run = [];
    for (let i = 1; i < points.length; i++) {
        if (
            (inside(points[i - 1]) || inside(points[i])) &&
            distance(points[i - 1], points[i]) <= maxGapKm
        ) {
            if (!run.length) run.push(points[i - 1]);
            run.push(points[i]);
        } else if (run.length) {
            runs.push(run);
            run = [];
        }
    }
    if (run.length) runs.push(run);
    return runs;
}
async function main() {
    const all = await query("{ lines { id publicCode name transportMode } }");
    const candidates = all.lines.filter(
        (l) =>
            (l.id.startsWith("RUT:") &&
                ["metro", "tram", "bus"].includes(l.transportMode)) ||
            l.transportMode === "rail",
    );
    const output = [];
    const stops = new Map();
    const skipped = [];
    let cursor = 0;
    const worker = async () => {
        while (cursor < candidates.length) {
            const candidate = candidates[cursor++];
            const { line } = await query(
                "query($id: ID!) { line(id:$id) { id publicCode name transportMode presentation { colour } journeyPatterns { name pointsOnLink { points } quays { id name latitude longitude stopPlace { id name } } } } }",
                { id: candidate.id },
            );
            const patterns = line.journeyPatterns.filter((p) =>
                p.quays.some((q) => inside([q.longitude, q.latitude])),
            );
            if (!patterns.length) continue;
            const seen = new Set();
            const segments = [];
            const stopIds = new Set();
            const destinations = new Set();
            for (const p of patterns) {
                if (!p.pointsOnLink?.points) {
                    skipped.push(`${line.id}: missing shape`);
                    continue;
                }
                const points = decodePolyline(p.pointsOnLink.points);
                // Some operators supply only stop-to-stop links, not track geometry.
                if (points.length <= p.quays.length * 2) {
                    skipped.push(`${line.id}: sparse geometry`);
                    continue;
                }
                if (!seen.has(p.pointsOnLink.points)) {
                    segments.push(
                        ...clipShape(
                            points,
                            line.transportMode === "rail" ? 0.75 : Infinity,
                        ).map(
                            (points) =>
                                simplify(lineString(points), {
                                    tolerance: 0.00005,
                                    highQuality: true,
                                }).geometry.coordinates,
                        ),
                    );
                    seen.add(p.pointsOnLink.points);
                }
                if (p.name) destinations.add(p.name);
                for (const q of p.quays.filter((q) =>
                    inside([q.longitude, q.latitude]),
                )) {
                    const id = q.stopPlace?.id || q.id;
                    stopIds.add(id);
                    if (!stops.has(id))
                        stops.set(id, {
                            id,
                            name: q.stopPlace?.name || q.name,
                            lat: q.latitude,
                            lng: q.longitude,
                            lines: [],
                        });
                    if (!stops.get(id).lines.includes(line.id))
                        stops.get(id).lines.push(line.id);
                }
            }
            if (!segments.length) continue;
            const official = line.presentation?.colour;
            output.push({
                id: line.id,
                code: line.publicCode || line.id,
                name: line.name,
                mode: line.transportMode,
                color: /^[0-9a-f]{6}$/i.test(official || "")
                    ? `#${official}`
                    : colors[line.transportMode],
                colorSource: official ? "Entur" : "mode fallback",
                destinations: [...destinations],
                stopIds: [...stopIds],
                geometry: { type: "MultiLineString", coordinates: segments },
            });
            if (output.length % 25 === 0)
                console.log(`Prepared ${output.length} Oslo-area routes`);
        }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    for (const line of output) {
        const unique = new Set();
        line.geometry.coordinates = line.geometry.coordinates.filter(
            (points) => {
                const key = JSON.stringify(points);
                if (unique.has(key)) return false;
                unique.add(key);
                return true;
            },
        );
    }
    output.sort((a, b) =>
        a.code.localeCompare(b.code, "nb", { numeric: true }),
    );
    if (
        ["metro", "tram", "bus", "rail"].some(
            (m) => !output.some((l) => l.mode === m),
        )
    )
        throw Error("Incomplete mode coverage; previous snapshot kept");
    const dataset = {
        schemaVersion: 1,
        fetchedAt: new Date().toISOString(),
        source: endpoint,
        attribution: "Entur, Norwegian Licence for Open Government Data (NLOD)",
        license: "https://developer.entur.no/terms-of-service",
        bounds,
        staticNetwork: true,
        omittedPatterns: skipped.length,
        lines: output,
        stops: [...stops.values()].filter((s) =>
            s.lines.some((id) => output.some((l) => l.id === id)),
        ),
    };
    await mkdir("public/data", { recursive: true });
    await writeFile(
        "public/data/oslo-transit.json.tmp",
        JSON.stringify(dataset),
    );
    await rename(
        "public/data/oslo-transit.json.tmp",
        "public/data/oslo-transit.json",
    );
    console.log(
        JSON.stringify({
            routes: output.length,
            stops: dataset.stops.length,
            omittedPatterns: skipped.length,
            modes: Object.fromEntries(
                Object.keys(colors).map((m) => [
                    m,
                    output.filter((l) => l.mode === m).length,
                ]),
            ),
        }),
    );
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/update-transit.mjs"))
    main().catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
    });
