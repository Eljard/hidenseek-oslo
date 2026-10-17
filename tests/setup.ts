import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import esriConfig from "@arcgis/core/config.js";
// ArcGIS 4.32 ships an Emscripten CommonJS loader inside an ESM package.
// Supply its Node globals and local WASM path without mocking calculations.
const require = createRequire(import.meta.url);
Object.assign(globalThis, {
    require,
    __dirname: dirname(require.resolve("@arcgis/core/chunks/pe-wasm.js")),
});
esriConfig.assetsPath = join(
    dirname(require.resolve("@arcgis/core/config.js")),
    "assets",
).replaceAll("\\", "/");
