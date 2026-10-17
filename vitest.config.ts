import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)).replaceAll(
                "\\",
                "/",
            ),
        },
    },
    test: {
        setupFiles: ["./tests/setup.ts"],
        alias: {
            "@/": fileURLToPath(new URL("./src/", import.meta.url)),
        },
    },
});
