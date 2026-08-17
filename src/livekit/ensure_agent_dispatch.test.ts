import assert from "node:assert/strict";
import { test } from "node:test";
import { JobStatus } from "@livekit/protocol";
import {
    dispatch_is_active,
    ensure_agent_dispatch,
    type AgentDispatchApi,
    type DispatchSnapshot,
} from "./ensure_agent_dispatch";

const ROOM = "recall-livekit-session";
const AGENT = "recall-livekit-voice-agent";
const METADATA = JSON.stringify({ session_id: "session" });

function snapshot(overrides: Partial<DispatchSnapshot> = {}): DispatchSnapshot {
    return {
        id: "AD_existing",
        agentName: AGENT,
        ...overrides,
    };
}

function fake_api(
    list_result: readonly DispatchSnapshot[] | Error,
    created: DispatchSnapshot = snapshot({ id: "AD_created" }),
): AgentDispatchApi & { created_count: number } {
    const api = {
        created_count: 0,
        async listDispatch(): Promise<readonly DispatchSnapshot[]> {
            if (list_result instanceof Error) throw list_result;
            return list_result;
        },
        async createDispatch(): Promise<DispatchSnapshot> {
            api.created_count += 1;
            return created;
        },
    };
    return api;
}

test("reuses a pending or running dispatch instead of creating another", async () => {
    const api = fake_api([
        snapshot({
            state: { jobs: [{ state: { status: JobStatus.JS_RUNNING } }] },
        }),
    ]);

    const result = await ensure_agent_dispatch({
        dispatch_api: api,
        room_name: ROOM,
        agent_name: AGENT,
        metadata: METADATA,
    });

    assert.equal(result.action, "reused");
    assert.equal(result.dispatch_id, "AD_existing");
    assert.equal(api.created_count, 0);
});

test("creates a dispatch when the previous job already finished", async () => {
    const api = fake_api([
        snapshot({
            state: { jobs: [{ state: { status: JobStatus.JS_SUCCESS } }] },
        }),
    ]);

    const result = await ensure_agent_dispatch({
        dispatch_api: api,
        room_name: ROOM,
        agent_name: AGENT,
        metadata: METADATA,
    });

    assert.equal(result.action, "created");
    assert.equal(result.dispatch_id, "AD_created");
    assert.equal(api.created_count, 1);
});

test("creates a dispatch when the room does not exist yet", async () => {
    const missing = Object.assign(new Error("room not found"), { status: 404 });
    const api = fake_api(missing);

    const result = await ensure_agent_dispatch({
        dispatch_api: api,
        room_name: ROOM,
        agent_name: AGENT,
        metadata: METADATA,
    });

    assert.equal(result.action, "created");
    assert.equal(api.created_count, 1);
});

test("propagates unexpected listDispatch failures", async () => {
    const api = fake_api(new Error("unauthorized"));

    await assert.rejects(
        () =>
            ensure_agent_dispatch({
                dispatch_api: api,
                room_name: ROOM,
                agent_name: AGENT,
                metadata: METADATA,
            }),
        /unauthorized/,
    );
    assert.equal(api.created_count, 0);
});

test("treats a not-yet-assigned dispatch as active", () => {
    assert.equal(dispatch_is_active(snapshot({ state: { jobs: [] } }), AGENT), true);
});

test("does not reuse a dispatch for a different agent name", () => {
    assert.equal(
        dispatch_is_active(snapshot({ agentName: "other-agent" }), AGENT),
        false,
    );
});
