import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";

export type WsEvent =
  | { type: "sdk_message"; message: Record<string, unknown> }
  | { type: "control_request"; controlRequest: Record<string, unknown> }
  | { type: "session_update"; sessionId: string | null; update: unknown }
  | { type: "file_read"; path: string; lines: number }
  | { type: "file_write"; path: string; bytes: number }
  | { type: "terminal_create"; terminalId: string; command: string }
  | { type: "terminal_output"; terminalId: string; output: string; exited: boolean }
  | { type: "terminal_kill"; terminalId: string }
  | { type: "terminal_release"; terminalId: string }
  | { type: "permission_request"; requestId: string; request: unknown }
  | { type: "permission_dismissed" }
  | { type: "elicitation_request"; requestId: string; request: unknown }
  | { type: "elicitation_dismissed" }
  | { type: "axon_event"; event: unknown }
  | { type: "turn_started"; turnId?: number }
  | { type: "turn_completed"; turnId?: number; stopReason?: string; result?: unknown }
  | { type: "turn_complete"; [key: string]: unknown }
  | { type: "turn_error"; error: string }
  | { type: "connection_progress"; step: string };

export class WsBroadcaster {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => {
      ws.on("error", () => {});
    });
  }

  broadcast(data: WsEvent): void {
    const msg = JSON.stringify(data);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  close(): void {
    this.wss.close();
  }
}
