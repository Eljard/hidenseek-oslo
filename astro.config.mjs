import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import { defineConfig } from "astro/config";
export default defineConfig({
    integrations: [react(), tailwind({ applyBaseStyles: false })],
    devToolbar: { enabled: false },
    site: "https://hidenseek.vedin.workers.dev",
    output: "static",
});
