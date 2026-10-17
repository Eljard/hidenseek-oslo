/** Structural types for the Cloudflare APIs used by this Worker. */
export interface Socket extends WebSocket {
    serializeAttachment(data: unknown): void;
    deserializeAttachment(): any;
}
export interface RoomState {
    storage: {
        get<T>(key: string): Promise<T | undefined>;
        put(key: string, value: unknown): Promise<void>;
        deleteAlarm(): Promise<void>;
        setAlarm(time: number): Promise<void>;
        sql: {
            exec<T = Record<string, unknown>>(
                sql: string,
                ...args: (string | number | ArrayBuffer | null)[]
            ): Iterable<T>;
        };
    };
    blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
    acceptWebSocket(socket: Socket): void;
    getWebSockets(): Socket[];
    waitUntil(promise: Promise<unknown>): void;
}
export interface Env {
    ASSETS: { fetch(request: Request): Promise<Response> };
    ROOMS: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(request: Request): Promise<Response> };
    };
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
}
