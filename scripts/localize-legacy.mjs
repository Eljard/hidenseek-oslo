// One-time source migration. Does not alter values, geometry or enum keys.
import fs from "node:fs";
import ts from "typescript";
const files = [
    "cards/matching.tsx",
    "cards/measuring.tsx",
    "cards/tentacles.tsx",
    "cards/base.tsx",
    "LatLngPicker.tsx",
    "CustomInitDialog.tsx",
    "UnitSelect.tsx",
    "ui/multi-select.tsx",
    "ZoneSidebar.tsx",
];
for (const relative of files) {
    const file = "src/components/" + relative;
    let source = fs.readFileSync(file, "utf8");
    if (source.includes("import { legacyText }")) continue;
    source = source.replace(
        "This action cannot be undone. This\r\n                                            will permanently delete the\r\n                                            question.",
        "Delete this question? You can undo this change from the game panel.",
    );
    const ast = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    const edits = [];
    const decode = (text) =>
        text
            .replaceAll("&apos;", "'")
            .replaceAll("&plusmn;", "±")
            .replaceAll("&ldquo;", "“")
            .replaceAll("&rdquo;", "”");
    function visit(n) {
        if (ts.isJsxText(n) && n.text.trim()) {
            const text = decode(n.text.trim().replace(/\s+/g, " "));
            edits.push([n.pos, n.end, `{legacyText(${JSON.stringify(text)})}`]);
        }
        if (
            ts.isJsxAttribute(n) &&
            n.initializer &&
            ts.isStringLiteral(n.initializer) &&
            ["placeholder", "title", "aria-label", "trigger"].includes(
                n.name.text,
            )
        )
            edits.push([
                n.initializer.getStart(ast),
                n.initializer.end,
                `{legacyText(${JSON.stringify(n.initializer.text)})}`,
            ]);
        ts.forEachChild(n, visit);
    }
    visit(ast);
    for (const [a, b, value] of edits.sort((a, b) => b[0] - a[0]))
        source = source.slice(0, a) + value + source.slice(b);
    source = "import { legacyText } from '@/oslo/legacy-i18n';\n" + source;
    fs.writeFileSync(file, source);
}
