// CORE — Read recording.done from a verified dashboard webhook payload.
// Create Async Transcript needs data.recording.id, not a bot ID.

import { z } from "zod";

const recording_done_webhook_schema = z.object({
    event: z.string().optional(),
    type: z.string().optional(),
    data: z.object({
        recording: z.union([
            z.string().min(1),
            z.object({
                id: z.string().min(1),
            }).passthrough(),
        ]).optional(),
    }).passthrough().optional(),
}).passthrough();

export function webhook_event_name(payload: unknown): string | undefined {
    const parsed = recording_done_webhook_schema.safeParse(payload);
    if (!parsed.success) {
        return undefined;
    }

    return parsed.data.event ?? parsed.data.type;
}

export function recording_id_from_recording_done_webhook(
    payload: unknown,
): string | undefined {
    const parsed = recording_done_webhook_schema.safeParse(payload);
    if (!parsed.success) {
        return undefined;
    }

    const event_name = parsed.data.event ?? parsed.data.type;
    if (event_name !== "recording.done") {
        return undefined;
    }

    const recording = parsed.data.data?.recording;
    if (typeof recording === "string") {
        return recording;
    }

    return recording?.id;
}
