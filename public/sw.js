self.addEventListener("install", (event) =>
    event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
    event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data?.json() || {};
    } catch {}
    // Every push displays an alert, including on iOS. Private answers and GPS
    // positions are deliberately absent from the server's push payload.
    event.waitUntil(
        self.registration.showNotification(data.title || "Hide & Seek Oslo", {
            body: data.body || "Spillet er oppdatert",
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            tag: data.tag || "game",
            data: { url: data.url || "/" },
        }),
    );
});
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        (async () => {
            const target = new URL(
                event.notification.data?.url || "/",
                self.location.origin,
            );
            if (target.origin !== self.location.origin) return;
            const windows = await self.clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            });
            for (const client of windows) {
                if (new URL(client.url).origin === target.origin) {
                    await client.navigate(target.href);
                    return client.focus();
                }
            }
            return self.clients.openWindow(target.href);
        })(),
    );
});
