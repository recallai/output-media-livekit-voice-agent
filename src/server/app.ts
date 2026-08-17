// REPLACEABLE — Express HTTP surface for this sample.
// Verifies the Output Media session, ensures a LiveKit Agent dispatch, and
// returns LiveKit connection details. Keep the verify → ensure_agent_dispatch
// → create_bridge_token flow; swap Express for any backend you prefer.

import express, { type Express } from "express";
import { z } from "zod";
import { verify_session_token } from "../auth/session_token";
import {
    create_bridge_token,
    type LiveKitBridgeTokenConfig,
} from "../livekit/create_bridge_token";
import {
    ensure_agent_dispatch,
    type AgentDispatchApi,
} from "../livekit/ensure_agent_dispatch";

const token_request_schema = z.object({
    session_token: z.string().min(1),
});

export interface ServerAppConfig extends LiveKitBridgeTokenConfig {
    output_media_signing_secret: string;
    dispatch_api: AgentDispatchApi;
}

export function create_app(config: ServerAppConfig): Express {
    const app = express();

    app.disable("x-powered-by");
    app.use(express.json({ limit: "8kb" }));

    app.get("/api/health", (_request, response) => {
        response.set("Cache-Control", "no-store");
        response.status(200).json({ status: "ok" });
    });

    app.post("/api/livekit-token", async (request, response) => {
        const parsed_request = token_request_schema.safeParse(request.body);
        if (!parsed_request.success) {
            response.status(400).json({ error: "A session token is required" });
            return;
        }

        let claims;
        try {
            claims = await verify_session_token(
                parsed_request.data.session_token,
                config.output_media_signing_secret,
            );
        } catch {
            response.status(401).json({ error: "The session token is invalid or expired" });
            return;
        }

        try {
            const dispatch = await ensure_agent_dispatch({
                dispatch_api: config.dispatch_api,
                room_name: claims.room_name,
                agent_name: claims.agent_name,
                metadata: JSON.stringify({
                    session_id: claims.session_id,
                    bridge_identity: claims.bridge_identity,
                    agent_identity: claims.agent_identity,
                }),
            });
            console.info(
                JSON.stringify({
                    event: "agent_dispatch_ensured",
                    action: dispatch.action,
                }),
            );

            const connection_details = await create_bridge_token(claims, config);
            response.set("Cache-Control", "no-store");
            response.status(201).json(connection_details);
        } catch (error) {
            console.error(
                JSON.stringify({
                    event: "livekit_token_failed",
                    error_type:
                        error instanceof Error ? error.constructor.name : "UnknownError",
                }),
            );
            response.status(500).json({ error: "Unable to create LiveKit connection details" });
        }
    });

    return app;
}
