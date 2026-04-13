import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { WsEvent } from "../shared/ws-events.ts";

export type { BaseWsEvent, WsEvent } from "../shared/ws-events.ts";

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
