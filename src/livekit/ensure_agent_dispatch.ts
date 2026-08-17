// CORE — Explicit LiveKit Agent dispatch that survives Output Media reloads.
// Token-embedded roomConfig.agents only runs when LiveKit first creates the
// room. A full page reload disconnects the bridge, the agent job can end, and
// the room can stay open for ~20s. Rejoining that room ignores the token
// dispatch, so the page stays on "Waiting for the agent."
// This lists existing dispatches and creates one only when the named agent
// does not already have a pending or running job.
// Vite Fast Refresh of App.tsx is handled separately: the client keeps the
// LiveKit bridge so it does not republish a new microphone under a leftover
// listening AgentSession.

import { JobStatus } from "@livekit/protocol";

export interface DispatchJobSnapshot {
    state?: {
        status?: JobStatus;
    };
}

export interface DispatchSnapshot {
    id: string;
    agentName: string;
    state?: {
        deletedAt?: bigint | number;
        jobs?: DispatchJobSnapshot[];
    };
}

export interface AgentDispatchApi {
    listDispatch(roomName: string): Promise<readonly DispatchSnapshot[]>;
    createDispatch(
        roomName: string,
        agentName: string,
        options?: { metadata?: string },
    ): Promise<DispatchSnapshot>;
}

export interface EnsureAgentDispatchArgs {
    dispatch_api: AgentDispatchApi;
    room_name: string;
    agent_name: string;
    metadata: string;
}

export interface EnsureAgentDispatchResult {
    action: "created" | "reused";
    dispatch_id: string;
}

function is_deleted(deleted_at: bigint | number | undefined): boolean {
    return deleted_at !== undefined && deleted_at !== 0 && deleted_at !== 0n;
}

function is_active_status(status: JobStatus | undefined): boolean {
    return (
        status === undefined ||
        status === JobStatus.JS_PENDING ||
        status === JobStatus.JS_RUNNING
    );
}

export function dispatch_is_active(
    dispatch: DispatchSnapshot,
    agent_name: string,
): boolean {
    if (dispatch.agentName !== agent_name) return false;
    if (is_deleted(dispatch.state?.deletedAt)) return false;

    const jobs = dispatch.state?.jobs ?? [];
    if (jobs.length === 0) return true;

    return jobs.some((job) => is_active_status(job.state?.status));
}

function is_missing_room_error(error: unknown): boolean {
    if (typeof error === "object" && error !== null && "status" in error) {
        const status = (error as { status?: unknown }).status;
        if (status === 404) return true;
    }

    return error instanceof Error && /not found/i.test(error.message);
}

export async function ensure_agent_dispatch({
    dispatch_api,
    room_name,
    agent_name,
    metadata,
}: EnsureAgentDispatchArgs): Promise<EnsureAgentDispatchResult> {
    let dispatches: readonly DispatchSnapshot[] = [];
    try {
        dispatches = await dispatch_api.listDispatch(room_name);
    } catch (error) {
        if (!is_missing_room_error(error)) throw error;
    }

    const existing = dispatches.find((dispatch) =>
        dispatch_is_active(dispatch, agent_name),
    );
    if (existing) {
        return { action: "reused", dispatch_id: existing.id };
    }

    const created = await dispatch_api.createDispatch(room_name, agent_name, {
        metadata,
    });

    return { action: "created", dispatch_id: created.id };
}
