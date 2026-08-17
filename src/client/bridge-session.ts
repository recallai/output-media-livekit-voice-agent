// SUPPORTING — Keep one BrowserBridge across Vite Fast Refresh of App.tsx.
// Saving the UI remounts the default export. Closing LiveKit there unpublished
// the meeting microphone and rejoined a still-running AgentSession that stayed
// on the ended track, so the page showed Listening with no talkback.

import type { BridgeStatus } from "../livekit/bridge_status";
import { BrowserBridge } from "../livekit/browser_bridge";
import type { LiveKitConnectionDetails } from "../livekit/create_bridge_token";

export interface BridgeSessionStartArgs {
    connectionDetails: LiveKitConnectionDetails;
    audioElement: HTMLAudioElement;
    onStatus: (status: BridgeStatus) => void;
}

let activeBridge: BrowserBridge | null = null;
let startPromise: Promise<BrowserBridge> | null = null;

export function attachBridgeSession(
    audioElement: HTMLAudioElement,
    onStatus: (status: BridgeStatus) => void,
): boolean {
    if (!activeBridge) return false;
    bindBridge(activeBridge, audioElement, onStatus);
    return true;
}

export async function startOrReuseBridgeSession(
    args: BridgeSessionStartArgs,
): Promise<BrowserBridge> {
    if (activeBridge) {
        bindBridge(activeBridge, args.audioElement, args.onStatus);
        return activeBridge;
    }

    if (startPromise) {
        const bridge = await startPromise;
        bindBridge(bridge, args.audioElement, args.onStatus);
        return bridge;
    }

    startPromise = (async () => {
        const bridge = new BrowserBridge({
            connection_details: args.connectionDetails,
            audio_element: args.audioElement,
            on_status: args.onStatus,
        });
        try {
            await bridge.connect();
        } catch (error) {
            await bridge.close().catch(() => undefined);
            throw error;
        }
        activeBridge = bridge;
        return bridge;
    })();

    try {
        return await startPromise;
    } finally {
        startPromise = null;
    }
}

function bindBridge(
    bridge: BrowserBridge,
    audioElement: HTMLAudioElement,
    onStatus: (status: BridgeStatus) => void,
): void {
    bridge.set_on_status(onStatus);
    bridge.adopt_audio_element(audioElement);
    onStatus(bridge.get_status());
}
