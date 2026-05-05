import type {
  Client,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  ElicitationRequest,
  ElicitationResponse,
} from "@runloop/remote-agents-sdk/acp";
import { CLIENT_METHODS } from "@runloop/remote-agents-sdk/acp";
import type { BaseWsEvent } from "../shared/ws-events.ts";

export type ClientEventListener = (event: BaseWsEvent) => void;

export class NodeACPClient implements Client {
  private listeners = new Set<ClientEventListener>();
  autoApprovePermissions = true;
  private pendingPermissions = new Map<
    string,
    {
      resolve: (resp: RequestPermissionResponse) => void;
      reject: (err: Error) => void;
    }
  >();
  private permissionCounter = 0;
  private pendingElicitations = new Map<
    string,
    {
      resolve: (resp: ElicitationResponse) => void;
      reject: (err: Error) => void;
    }
  >();
  private elicitationCounter = 0;

  onEvent(listener: ClientEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: BaseWsEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  resolvePermission(requestId: string, response: RequestPermissionResponse): void {
    const pending = this.pendingPermissions.get(requestId);
    if (pending) {
      pending.resolve(response);
      this.pendingPermissions.delete(requestId);
    }
  }

  resolveElicitation(requestId: string, response: ElicitationResponse): void {
    const pending = this.pendingElicitations.get(requestId);
    if (pending) {
      pending.resolve(response);
      this.pendingElicitations.delete(requestId);
    }
  }

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    if (this.autoApprovePermissions) {
      const option =
        params.options.find((o) => o.kind === "allow_once") ??
        params.options[0];

      return {
        outcome: option
          ? { outcome: "selected", optionId: option.optionId }
          : { outcome: "cancelled" },
      };
    }

    const requestId = `perm-${++this.permissionCounter}`;

    this.emit({ type: "permission_request", requestId, request: params });

    const response = await new Promise<RequestPermissionResponse>(
      (resolve, reject) => {
        this.pendingPermissions.set(requestId, { resolve, reject });
      },
    );

    return response;
  }

  async sessionUpdate(_params: SessionNotification): Promise<void> {
    // Session updates are consumed via timeline events on the frontend.
  }

  private static IGNORED_NOTIFICATIONS = new Set([
    "initialize",
    "session/new",
    "session/set_mode",
    "session/prompt",
  ]);

  async extNotification(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (method === CLIENT_METHODS.session_elicitation_complete) {
      for (const [id, pending] of this.pendingElicitations) {
        pending.reject(new Error("Elicitation completed by agent"));
        this.pendingElicitations.delete(id);
      }
      this.emit({ type: "elicitation_dismissed" });
      return;
    }
    if (NodeACPClient.IGNORED_NOTIFICATIONS.has(method)) return;
    console.log(`[ACP] unhandled notification: ${method}`, params);
  }

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === CLIENT_METHODS.session_elicitation) {
      const request = params as unknown as ElicitationRequest;
      const requestId = `elicit-${++this.elicitationCounter}`;

      this.emit({ type: "elicitation_request", requestId, request });

      const response = await new Promise<ElicitationResponse>(
        (resolve, reject) => {
          this.pendingElicitations.set(requestId, { resolve, reject });
        },
      );

      return response as unknown as Record<string, unknown>;
    }

    throw new Error(`Unknown ext method: ${method}`);
  }

  shutdown(): void {
    for (const pending of this.pendingPermissions.values()) {
      pending.reject(new Error("Client shutting down"));
    }
    this.pendingPermissions.clear();
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error("Client shutting down"));
    }
    this.pendingElicitations.clear();
    this.listeners.clear();
  }
}
