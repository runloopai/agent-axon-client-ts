import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { AxonEventView, ClaudeTimelineEvent, SDKControlRequest, SDKMessage } from "@runloop/agent-axon-client/claude";

export type WsEvent =
  | { type: "sdk_message"; message: SDKMessage }
  | { type: "control_request"; controlRequest: SDKControlRequest }
  | { type: "turn_complete"; result: SDKMessage }
  | { type: "turn_error"; error: string }
  | { type: "axon_event"; event: AxonEventView }
  | { type: "timeline_event"; event: ClaudeTimelineEvent }
  | { type: "connection_progress"; step: string };

export class WsBroadcaster {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws) => {
      console.log(`[ws] client connected (total: ${this.wss.clients.size})`);
      ws.on("close", () => {
        console.log(`[ws] client disconnected (total: ${this.wss.clients.size})`);
      });
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
