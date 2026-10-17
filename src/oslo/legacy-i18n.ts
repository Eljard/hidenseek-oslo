import { language } from "./state";
const nb: Record<string, string> = {
    "Draw the hiding zone!": "Tegn spilleområdet",
    "Draw the matching zone(s)!": "Tegn sammenligningsområdet",
    "Draw the measuring zone(s)!": "Tegn avstandsområdet",
    "Edit area": "Rediger område",
    "Delete area": "Slett område",
    "Cancel drawing": "Avbryt tegning",
    Finish: "Fullfør",
    "Undo last point": "Angre siste punkt",
    "Click to start drawing": "Klikk for å starte tegningen",
    "Click to add a point": "Klikk for å legge til et punkt",
    "Click the first point to finish": "Klikk på første punkt for å fullføre",
    "Changing the area clears questions. Continue?":
        "Når du endrer området, fjernes spørsmålene. Fortsette?",
    Miles: "Miles",
    Kilometers: "Kilometer",
    Meters: "Meter",
    "Railway Stations": "Togstasjoner",
    "Subway Stations": "T-banestasjoner",
    "Tram Stops": "Trikkeholdeplasser",
    "Bus Stops": "Bussholdeplasser",
    Result: "Svar",
    Shorter: "Kortere",
    Same: "Samme",
    Longer: "Lengre",
    Different: "Forskjellig",
    "Hider Further": "Gjemmeren er lenger unna",
    "Hider Closer": "Gjemmeren er nærmere",
    "No zone found": "Fant ikke noe område",
    Zone: "Område",
    "Share this Question!": "Del spørsmålet",
    "Copy to Clipboard": "Kopier til utklippstavlen",
    "Are you absolutely sure?": "Er du sikker?",
    Cancel: "Avbryt",
    "Delete All Questions": "Slett alle spørsmål",
    "Delete Question": "Slett spørsmålet",
    "Search place...": "Søk etter sted…",
    Latitude: "Breddegrad",
    Longitude: "Lengdegrad",
    "Google Plus Code": "Google Plus Code",
    Import: "Importer",
    "Edit coordinates": "Rediger koordinater",
    Update: "Oppdater",
    Done: "Ferdig",
    "Set to current location": "Bruk min posisjon",
    "Paste coordinates from clipboard": "Lim inn koordinater",
    "Copy coordinates to clipboard": "Kopier koordinater",
    "New Custom Question": "Nytt egendefinert spørsmål",
    "Do you want the new question to start blank, or copy what the current question contains?":
        "Vil du starte med et tomt spørsmål, eller kopiere det nåværende?",
    "Remember my choice": "Husk valget mitt",
    "Start blank": "Start tomt",
    "Copy from current": "Kopier nåværende",
    "Search...": "Søk…",
    "No results found.": "Ingen treff.",
    "(Select All)": "(Velg alle)",
    Clear: "Tøm",
    Close: "Lukk",
    "Hiding Zone": "Gjemmeområder",
    "Display hiding zones?": "Vis gjemmeområder?",
    "Warning: This feature can drastically slow down your device.":
        "Mange gjemmeområder kan gjøre kartet tregere.",
    "Use custom station list?": "Bruk egen stasjonsliste?",
    "Merge duplicated stations?": "Slå sammen dupliserte stasjoner?",
    "Import stations from URL (CSV, GeoJSON, KML). This must be a raw file link.":
        "Importer stasjoner fra en direkte fillenke (CSV, GeoJSON, KML).",
    "Include default stations with custom list?":
        "Ta med standardstasjonene i den egendefinerte listen?",
    "Clear Imported": "Tøm importerte",
    "Hiding Zone Radius": "Radius for gjemmeområder",
    "No Display": "Skjul alle",
    "All Stations": "Alle stasjoner",
    "All Zones": "Alle områder",
    "No Overlap": "Uten overlapp",
    "Current:": "Nåværende:",
    "Clear Disabled": "Nullstill deaktiverte",
    "Disable All": "Deaktiver alle",
    "No hiding zones found.": "Fant ingen gjemmeområder.",
    View: "Vis",
    "Question Type": "Spørsmålstype",
    "Location Type": "Stedstype",
    Question: "Spørsmål",
    "Custom Locations": "Egendefinerte steder",
    "Theme Parks": "Fornøyelsesparker",
    Zoos: "Dyreparker",
    Aquariums: "Akvarier",
    Museums: "Museer",
    Hospitals: "Sykehus",
    "Movie Theaters": "Kinoer",
    Libraries: "Biblioteker",
    "15 Miles (Typically)": "Vanligvis 24 km",
    "1 Mile (Typically)": "Vanligvis 1,6 km",
    "Hiding Zone Mode": "Modus for gjemmeområder",
    Matching: "Sammenligning",
    Measuring: "Avstand",
    Tentacles: "Tentakler",
    miles: "miles",
    kilometers: "kilometer",
    meters: "meter",
    Save: "Lagre",
    "This question will only influence the map when you click on a hiding zone in the hiding zone sidebar.":
        "Dette spørsmålet påvirker kartet når du velger et område i panelet for gjemmeområder.",
    "This question will eliminate hiding zones that don't fit the criteria. When you click on a zone, the parts of that zone that don't satisfy the criteria will be eliminated.":
        "Spørsmålet utelukker gjemmeområder som ikke passer. Velg et gjemmeområde for å se hvilke deler som gjenstår.",
    "To modify the matching": "For å redigere sammenligningen",
    ", enable it:": ", aktiver den:",
    "and use the buttons at the bottom left of the map.":
        "og bruk knappene nederst til venstre på kartet.",
    "To modify the measuring question, enable it:":
        "Aktiver avstandsspørsmålet for å redigere det:",
    "To modify tentacle locations, enable it:":
        "Aktiver redigering av tentakelstedene:",
    "Warning: The zone data has been simplified by ±360 feet (100 meters) in order for the browser to not crash.":
        "Områdegrensene er forenklet med omtrent 100 meter for at kartet skal fungere i nettleseren.",
    "Warning: The train line data is based on OpenStreetMap and may have fewer train stations than expected. If you are using this tool, ensure that the other players are also using this tool.":
        "Spørsmålenes toglinjer bruker OpenStreetMap og kan mangle stasjoner. Alle spillere bør bruke det samme verktøyet.",
    "Below you can access the JSON representing the question. Send this to another player for them to copy. They can then click “Paste Question” at the bottom of the “Questions” sidebar.":
        "Kopier spørsmålet som JSON. Hele spillet kan også eksporteres fra spillpanelet.",
    "Delete this question? You can undo this change from the game panel.":
        "Slette spørsmålet? Du kan angre fra spillpanelet.",
};
const subjects: Record<string, string> = {
    "Commercial Airport In Zone": "Flyplass i området",
    "Major City (1,000,000+ people) In Zone":
        "Storby i området (over 1 million innbyggere)",
    "Major City (1,000,000+ people)": "Storby (over 1 million innbyggere)",
    Aquarium: "Akvarium",
    Zoo: "Dyrepark",
    "Theme Park": "Fornøyelsespark",
    Mountain: "Fjell",
    Museum: "Museum",
    Hospital: "Sykehus",
    Cinema: "Kino",
    Library: "Bibliotek",
    "Golf Course": "Golfbane",
    "Foreign Consulate": "Utenlandsk konsulat",
    Park: "Park",
    "Zone Starts With Same Letter": "Område med samme forbokstav",
    "Station Starts With Same Letter": "Stasjon med samme forbokstav",
    "Station Has Same Length": "Stasjonsnavn med samme lengde",
    "Station On Same Train Line": "Stasjon på samme toglinje",
    "Custom Zone": "Egendefinert område",
    "Custom Points": "Egendefinerte punkter",
    Coastline: "Kystlinje",
    "High-Speed Rail": "Høyhastighetsbane",
    "Admin Border": "Administrativ grense",
    "Train Station": "Togstasjon",
    "Custom Measure": "Egendefinert avstand",
    Zone: "Område",
};
export function legacyText(text: string | undefined): string {
    if (!text) return "";
    if (language.get() === "en") return text;
    const clean = text
        .replaceAll("&apos;", "'")
        .replaceAll("&plusmn;", "±")
        .replaceAll("&ldquo;", "“")
        .replaceAll("&rdquo;", "”")
        .replace(/\s+/g, " ")
        .trim();
    if (nb[clean]) return nb[clean];
    if (clean.endsWith(" Question (Small+Medium Games)"))
        return `${subjects[clean.replace(" Question (Small+Medium Games)", "")] || clean} (små og mellomstore spill)`;
    if (clean.endsWith(" Question"))
        return subjects[clean.replace(" Question", "")] || clean;
    return subjects[clean] || text;
}
