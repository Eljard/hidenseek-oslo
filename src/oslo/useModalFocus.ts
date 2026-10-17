import { useEffect, useRef } from "react";
/** Focus stays inside a modal, Escape closes it, and closing restores focus. */
export function useModalFocus<T extends HTMLElement>(
    open: boolean,
    onClose: () => void,
) {
    const ref = useRef<T>(null),
        close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        const items = () =>
            Array.from(
                ref.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
                ) || [],
            ).filter((el) => el.getClientRects().length > 0);
        items()[0]?.focus();
        const key = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close.current();
            }
            if (e.key === "Tab") {
                const all = items(),
                    first = all[0],
                    last = all.at(-1);
                if (!first) {
                    e.preventDefault();
                    return;
                }
                if (
                    e.shiftKey &&
                    (document.activeElement === first ||
                        !ref.current?.contains(document.activeElement))
                ) {
                    e.preventDefault();
                    last?.focus();
                } else if (
                    !e.shiftKey &&
                    (document.activeElement === last ||
                        !ref.current?.contains(document.activeElement))
                ) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", key);
        return () => {
            document.removeEventListener("keydown", key);
            previous?.focus();
        };
    }, [open]);
    return ref;
}
