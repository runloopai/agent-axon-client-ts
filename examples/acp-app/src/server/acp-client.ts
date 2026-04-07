import type {
  Client,
  Agent,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  SessionUpdate,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  KillTerminalRequest,
  KillTerminalResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  ElicitationRequest,
  ElicitationResponse,
} from "@runloop/agent-axon-client/acp";
import { CLIENT_METHODS } from "@runloop/agent-axon-client/acp";
import type { AxonEventView } from "@runloop/agent-axon-client/acp";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TerminalManager } from "./terminal-manager.ts";

export type ClientEventListener = (event: ClientEvent) => void;

export type ClientEvent =
  | { type: "session_update"; sessionId: string | null; update: SessionUpdate }
  | { type: "file_read"; path: string; lines: number }
  | { type: "file_write"; path: string; bytes: number }
  | { type: "terminal_create"; terminalId: string; command: string }
  | {
      type: "terminal_output";
      terminalId: string;
      output: string;
      exited: boolean;
    }
  | { type: "terminal_kill"; terminalId: string }
  | { type: "terminal_release"; terminalId: string }
  | {
      type: "permission_request";
      requestId: string;
      request: RequestPermissionRequest;
    }
  | { type: "permission_dismissed" }
  | {
      type: "elicitation_request";
      requestId: string;
      request: ElicitationRequest;
    }
  | { type: "elicitation_dismissed" }
  | { type: "axon_event"; event: AxonEventView }
  | { type: "turn_started"; turnId: number }
  | { type: "turn_completed"; turnId: number; stopReason: string }
  | ({ type: "turn_complete" } & PromptResponse)
  | { type: "turn_error"; error: string }
  | { type: "connection_progress"; step: string };

export class NodeACPClient implements Client {
  private terminalManager = new TerminalManager();
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

  private emit(event: ClientEvent): void {
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
        params.options.find((o) => o.kind === "allow_always") ??
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

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.emit({
      type: "session_update",
      sessionId: params.sessionId ?? null,
      update: params.update,
    });
  }

  async readTextFile(
    params: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    console.log(
      `[ACP] fs/read_text_file: "${params.path}" line=${params.line ?? 0} limit=${params.limit ?? "all"}`,
    );
    const raw = await fs.readFile(params.path, "utf-8");
    let lines = raw.split("\n");

    if (params.line != null && params.line > 0) {
      lines = lines.slice(params.line - 1);
    }
    if (params.limit != null && params.limit > 0) {
      lines = lines.slice(0, params.limit);
    }

    const content = lines.join("\n");
    this.emit({ type: "file_read", path: params.path, lines: lines.length });
    return { content };
  }

  async writeTextFile(
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    console.log(
      `[ACP] fs/write_text_file: "${params.path}" (${Buffer.byteLength(params.content)} bytes)`,
    );
    await fs.mkdir(path.dirname(params.path), { recursive: true });
    await fs.writeFile(params.path, params.content, "utf-8");
    this.emit({
      type: "file_write",
      path: params.path,
      bytes: Buffer.byteLength(params.content),
    });
    return {};
  }

  async createTerminal(
    params: CreateTerminalRequest,
  ): Promise<CreateTerminalResponse> {
    const cmdStr = [params.command, ...(params.args ?? [])].join(" ");
    console.log(
      `[ACP] terminal/create: "${cmdStr}" cwd=${params.cwd ?? "(none)"}`,
    );

    const terminalId = this.terminalManager.create({
      command: params.command,
      args: params.args,
      cwd: params.cwd,
      env: params.env,
      outputByteLimit: params.outputByteLimit,
    });

    this.emit({ type: "terminal_create", terminalId, command: cmdStr });
    return { terminalId };
  }

  async terminalOutput(
    params: TerminalOutputRequest,
  ): Promise<TerminalOutputResponse> {
    const entry = this.terminalManager.get(params.terminalId);
    if (!entry) throw new Error(`Terminal ${params.terminalId} not found`);

    this.emit({
      type: "terminal_output",
      terminalId: params.terminalId,
      output: entry.output,
      exited: entry.exited,
    });

    const exceeded =
      entry.outputByteLimit > 0 &&
      Buffer.byteLength(entry.output) >= entry.outputByteLimit;

    return {
      output: entry.output,
      truncated: exceeded,
      ...(entry.exited
        ? { exitStatus: { exitCode: entry.exitCode, signal: entry.signal } }
        : {}),
    };
  }

  async waitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    const result = await this.terminalManager.waitForExit(params.terminalId);
    return { exitCode: result.exitCode, signal: result.signal };
  }

  async killTerminal(
    params: KillTerminalRequest,
  ): Promise<KillTerminalResponse> {
    this.terminalManager.kill(params.terminalId);
    this.emit({ type: "terminal_kill", terminalId: params.terminalId });
    return {};
  }

  async releaseTerminal(
    params: ReleaseTerminalRequest,
  ): Promise<ReleaseTerminalResponse> {
    this.terminalManager.release(params.terminalId);
    this.emit({ type: "terminal_release", terminalId: params.terminalId });
    return {};
  }

  // These notifications are just informational and are already sent as events.
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
    this.terminalManager.releaseAll();
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

export function createNodeClient(_agent: Agent): NodeACPClient {
  return new NodeACPClient();
}
