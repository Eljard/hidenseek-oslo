export type Category =
    | "radar"
    | "matching"
    | "measuring"
    | "thermometer"
    | "photo"
    | "tentacle";
export type QuestionSpec = {
    id: string;
    category: Category;
    nb: string;
    en: string;
    minutes: number;
    draw: number;
    keep: number;
    distance?: number;
    optional?: boolean;
};
const places = [
    ["Flyplass", "Airport"],
    ["Fjell", "Mountain"],
    ["Park", "Park"],
    ["Fornøyelsespark", "Amusement park"],
    ["Dyrepark", "Zoo"],
    ["Akvarium", "Aquarium"],
    ["Golfbane", "Golf course"],
    ["Museum", "Museum"],
    ["Kino", "Cinema"],
    ["Sykehus", "Hospital"],
    ["Bibliotek", "Library"],
    ["Konsulat", "Consulate"],
];
function group(
    category: Category,
    names: string[][],
    draw: number,
    minutes = 5,
    optional = false,
): QuestionSpec[] {
    return names.map(([nb, en], i) => ({
        id: `${category}-${i}`,
        category,
        nb,
        en,
        minutes,
        draw,
        keep: category === "tentacle" ? 2 : 1,
        optional,
    }));
}
export const catalog: QuestionSpec[] = [
    ...[500, 1000, 2000, 5000, 10000, 25000, 40000, 80000, 160000, 0].map(
        (distance, i) => ({
            id: `radar-${i}`,
            category: "radar" as const,
            nb: distance
                ? distance < 1000
                    ? `${distance} m`
                    : `${distance / 1000} km`
                : "Egen radius",
            en: distance
                ? distance < 1000
                    ? `${distance} m`
                    : `${distance / 1000} km`
                : "Custom radius",
            distance,
            minutes: 5,
            draw: 2,
            keep: 1,
        }),
    ),
    ...group(
        "matching",
        [
            ...places,
            ["Kollektivlinje", "Transit service"],
            ["Antall tegn i stasjonsnavn", "Station name length"],
            ["Gate eller sti", "Street or path"],
            ["Landmasse", "Landmass"],
            ...Array.from({ length: 4 }, (_, i) => [
                `Administrativt område ${i + 1}`,
                `Administrative area ${i + 1}`,
            ]),
        ],
        3,
    ),
    ...group(
        "measuring",
        [
            ...places,
            ["Høyhastighetsbane", "High-speed railway"],
            ["Togstasjon", "Rail station"],
            ["Landegrense", "International border"],
            ["Administrativ grense 1", "Administrative border 1"],
            ["Administrativ grense 2", "Administrative border 2"],
            ["Høyde over havet", "Altitude"],
            ["Navngitt vann", "Named water body"],
            ["Kyst", "Coast"],
        ],
        3,
    ),
    ...group(
        "thermometer",
        [
            ["Kort reise", "Short journey"],
            ["Lang reise", "Long journey"],
        ],
        2,
    ),
    ...group(
        "photo",
        [
            ["Bygning fra stasjonen", "Building from station"],
            ["Bredeste gate", "Widest street"],
            ["Et helt tre", "Entire tree"],
            ["Høyeste synlige byggverk", "Tallest visible structure"],
            ["Selfie", "Selfie"],
            ["Himmel", "Sky"],
        ],
        1,
        10,
    ),
    ...group(
        "tentacle",
        [
            ["Museer · 2 km", "Museums · 2 km"],
            ["Biblioteker · 2 km", "Libraries · 2 km"],
            ["Kinoer · 2 km", "Cinemas · 2 km"],
            ["Sykehus · 2 km", "Hospitals · 2 km"],
        ],
        4,
        5,
        true,
    ),
];
export const categoryLabels: Record<Category, [string, string]> = {
    radar: ["Radar", "Radar"],
    matching: ["Sammenligning", "Matching"],
    measuring: ["Avstand", "Measuring"],
    thermometer: ["Varmere/kaldere", "Thermometer"],
    photo: ["Foto", "Photo"],
    tentacle: ["Tentakler", "Tentacles"],
};
