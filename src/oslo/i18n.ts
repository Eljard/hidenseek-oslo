import { useStore } from "@nanostores/react";

import { language } from "./state";
export function useText() {
    const lang = useStore(language);
    return (nb: string, en: string) => (lang === "nb" ? nb : en);
}
