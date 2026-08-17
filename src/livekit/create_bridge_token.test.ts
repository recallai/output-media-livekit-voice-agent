import assert from "node:assert/strict";
import { test } from "node:test";
import { create_bridge_token } from "./create_bridge_token";
import { create_session_identity } from "./identity";

function decode_jwt_payload(token: string): Record<string, unknown> {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("JWT is missing a payload");
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<
        string,
        unknown
    >;
}

test("bridge tokens do not embed roomConfig agent dispatch", async () => {
    const identity = create_session_identity("11111111-1111-4111-8111-111111111111");
    const details = await create_bridge_token(
        {
            ...identity,
            agent_name: "recall-livekit-voice-agent",
        },
        {
            livekit_url: "wss://example.livekit.cloud",
            livekit_api_key: "devkey",
            livekit_api_secret: "secretsecretsecretsecretsecretse",
            token_ttl_seconds: 600,
        },
    );

    const payload = decode_jwt_payload(details.participant_token);
    const room_config = payload.roomConfig as { agents?: unknown[] } | undefined;

    assert.equal(details.agent_identity, identity.agent_identity);
    assert.equal(room_config?.agents, undefined);
});
