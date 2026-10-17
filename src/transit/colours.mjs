import busColours from "./ruter-bus-colours.json" with { type: "json" };

// RGB swatches read from the PDFs linked by Ruter on 17 October 2026.
// Keep this separate from Entur presentation.colour, which often gives a
// transport-mode colour instead of the colour used on the line map.
export const colourSources = {
    metro: "https://cdn.sanity.io/files/5a84xxkm/prod/e46cf566dd5b9cc4e323b70b168115d7bc3c911f.pdf",
    tram: "https://cdn.sanity.io/files/5a84xxkm/prod/f7472dd295ba0e657bcd8943f928dd088c63e6e8.pdf",
    rail: "https://www.banenor.no/contentassets/d375dd318f2246c39e03ca86a1ece36f/linjekart-osloregionen-fra-14.-des-2025.pdf",
    nationalRail:
        "https://www.banenor.no/contentassets/86c77c18bc374b7282e56fe3fcf556fe/linjekart-alle-linjer-fra-15.-des-2024.pdf",
};
export const modeColours = {
    metro: "#ef7d00",
    tram: "#00a2df",
    bus: "#ee1d23",
    rail: "#1a236e",
};
const metro = {
    1: "#009cdc",
    2: "#ea5b0b",
    3: "#a863a5",
    4: "#00489a",
    5: "#3aaa35",
};
const tram = {
    12: "#86489c",
    13: "#00a2df",
    15: "#f1669a",
    17: "#ee1b2d",
    18: "#faaf18",
    19: "#4cb848",
};

/** The fallback stays explicitly attributed; unknown codes never inherit a
 * different line's colour just because their numbers share a prefix. */
export function lineColour(mode, code, feedColour) {
    const key = String(code).replaceAll(" ", "").toUpperCase();
    const mapped =
        mode === "metro" ? metro[key] : mode === "tram" ? tram[key] : undefined;
    if (mapped)
        return {
            color: mapped,
            colorSource: `Ruter line map: ${colourSources[mode]}`,
        };
    if (mode === "bus" && busColours[key])
        return {
            color: busColours[key].color,
            colorSource: `Ruter line map: ${busColours[key].source}`,
        };
    if (mode === "rail" && /^(?:L\d|R\d|RE\d|RX\d)/.test(key)) {
        const color = key.startsWith("L")
            ? "#9dcd58"
            : /^R[EX]/.test(key)
              ? "#7cd3f6"
              : "#ef3e2e";
        return {
            color,
            colorSource: `Bane NOR Oslo region line map: ${colourSources.rail}`,
        };
    }
    if (mode === "rail" && /^F[1456]$/.test(key))
        return {
            color: "#185aaa",
            colorSource: `Bane NOR national line map: ${colourSources.nationalRail}`,
        };
    if (/^#?[0-9a-f]{6}$/i.test(feedColour || ""))
        return {
            color: `#${feedColour.replace("#", "")}`,
            colorSource: "Entur presentation.colour",
        };
    return { color: modeColours[mode], colorSource: "Ruter mode fallback" };
}
