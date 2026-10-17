import { expect, it } from "vitest";
import { lineColour } from "../src/transit/colours.mjs";
import data from "../public/data/oslo-transit.json";

it("uses Ruter line colours instead of mode colours", () => {
    expect(
        ["1", "2", "3", "4", "5"].map(
            (code) => lineColour("metro", code, "EC700C").color,
        ),
    ).toEqual(["#009cdc", "#ea5b0b", "#a863a5", "#00489a", "#3aaa35"]);
    expect(
        ["12", "13", "15", "17", "18", "19"].map(
            (code) => lineColour("tram", code).color,
        ),
    ).toEqual([
        "#86489c",
        "#00a2df",
        "#f1669a",
        "#ee1b2d",
        "#faaf18",
        "#4cb848",
    ]);
    expect(
        ["20", "21", "30", "31", "37"].map(
            (code) => lineColour("bus", code).color,
        ),
    ).toEqual(["#ee1d23", "#003d5d", "#8bc63e", "#003d5d", "#ee1d23"]);
    expect(lineColour("rail", "RE30").color).toBe("#7cd3f6");
});
it("keeps unknown lines attributed to their feed or mode fallback", () => {
    expect(lineColour("bus", "9999", "123456")).toEqual({
        color: "#123456",
        colorSource: "Entur presentation.colour",
    });
    expect(lineColour("bus", "9999").colorSource).toContain("fallback");
});
it("ships the same palette used by the refresh pipeline", () => {
    for (const l of data.lines)
        expect(l.color).toBe(lineColour(l.mode, l.code, l.feedColor).color);
});
