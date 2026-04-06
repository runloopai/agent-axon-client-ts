import type {
  ToolKind,
  ToolCallStatus,
  StopReason,
  PlanEntryPriority,
  PlanEntryStatus,
  ToolCallLocation,
  PlanEntry,
  ModelInfo,
  AvailableCommand,
  SessionMode,
  SessionInfo,
  Diff,
  Terminal as ACPTerminal,
  UsageUpdate,
  AuthMethod,
  ElicitationAction,
  ElicitationContentValue,
  PermissionOption,
  PermissionOptionKind,
  ToolCallUpdate,
} from "@runloop/agent-axon-client/acp";

export type {
  ToolKind,
  ToolCallStatus,
  StopReason,
  PlanEntryPriority,
  PlanEntryStatus,
  ToolCallLocation,
  PlanEntry,
  ModelInfo,
  AvailableCommand,
  SessionMode,
  AuthMethod,
  ElicitationAction,
  ElicitationContentValue,
  PermissionOption,
  PermissionOptionKind,
  ToolCallUpdate,
};

export type DiffContent = Diff;
export type TerminalContent = ACPTerminal;
export type UsageState = UsageUpdate;
export type SessionListEntry = SessionInfo;

import type { AxonEventView } from "@runloop/agent-axon-client/acp";
export type { AxonEventView };

export interface AgentInfo {
  name?: string;
  title?: string | null;
  version?: string;
}

export interface AgentCapabilities {
  loadSession?: boolean;
  promptCapabilities?: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  mcpCapabilities?: {
    http?: boolean;
    sse?: boolean;
  };
  sessionCapabilities?: {
    list?: Record<string, unknown>;
  };
}

export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean;
    writeTextFile?: boolean;
  };
  terminal?: boolean;
  elicitation?: {
    form?: Record<string, unknown>;
  };
}

export interface ConnectionDetails {
  protocolVersion: number | null;
  agentCapabilities: AgentCapabilities | null;
  clientCapabilities: ClientCapabilities | null;
  sessionMeta: Record<string, unknown> | null;
}

export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "ready"
  | "error";

export interface ContentItem {
  type: "content" | "diff" | "terminal";
  text?: string;
  diff?: DiffContent;
  terminal?: TerminalContent;
}

// --- Turn block types ---

export interface ThinkingBlock {
  type: "thinking";
  id: string;
  text: string;
  duration: number | null;
  isActive: boolean;
}

export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  toolCallId: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  locations: ToolCallLocation[];
  content: ContentItem[];
  rawInput?: unknown;
  rawOutput?: unknown;
  startedAt: number;
  duration?: number | null;
}

export interface TextBlock {
  type: "text";
  id: string;
  text: string;
  messageId?: string | null;
}

export interface PlanBlock {
  type: "plan";
  id: string;
  entries: PlanEntry[];
}

export interface ResourceLinkBlock {
  type: "resource_link";
  id: string;
  uri: string;
  name?: string | null;
  title?: string | null;
}

export interface ImageBlock {
  type: "image";
  id: string;
  data: string;
  mimeType: string;
  uri?: string | null;
}

export interface AudioBlock {
  type: "audio";
  id: string;
  data: string;
  mimeType: string;
}

export interface EmbeddedResourceBlock {
  type: "resource";
  id: string;
  uri: string;
  mimeType?: string | null;
  text?: string;
  blob?: string;
}

export type TurnBlock =
  | ThinkingBlock
  | ToolCallBlock
  | TextBlock
  | PlanBlock
  | ResourceLinkBlock
  | ImageBlock
  | AudioBlock
  | EmbeddedResourceBlock;

// --- Chat message ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: TurnBlock[];
  stopReason?: StopReason;
}

// --- Elicitation types ---

export interface ElicitationFieldSchema {
  type: "string" | "number" | "integer" | "boolean" | "array";
  title?: string | null;
  description?: string | null;
  default?: unknown;
  enum?: string[] | null;
  oneOf?: Array<{ const: string; title: string }> | null;
  items?: { enum?: string[]; oneOf?: Array<{ const: string; title: string }> } | null;
}

export interface PendingPermission {
  requestId: string;
  toolTitle: string;
  toolKind: string;
  toolCallId: string;
  rawInput?: unknown;
  options: PermissionOption[];
}

export interface PendingElicitation {
  requestId: string;
  message: string;
  mode: "form" | "url";
  schema?: {
    title?: string | null;
    description?: string | null;
    properties?: Record<string, ElicitationFieldSchema>;
    required?: string[] | null;
  };
  url?: string;
}

// --- Sidebar types ---

export interface ToolActivity {
  toolCallId: string;
  kind: string;
  title: string;
  status: string;
  command?: string;
  output?: string;
  timestamp: number;
}

export interface FileOp {
  id: string;
  type: "read" | "write";
  path: string;
  detail: string;
  timestamp: number;
}

export interface TerminalState {
  terminalId: string;
  command: string;
  output: string;
  exited: boolean;
  timestamp: number;
}

export interface SessionConfigOption {
  id: string;
  type: string;
  name: string;
  currentValue?: string;
  options?: Array<{ value?: string; name: string; options?: Array<{ value?: string; name: string }> }>;
}

// --- Hook return type ---

export interface UseNodeAgentReturn {
  connectionPhase: ConnectionPhase;
  error: string | null;
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
  isStreaming: boolean;
  usage: UsageState | null;
  plan: PlanEntry[] | null;
  toolActivity: ToolActivity[];
  fileOps: FileOp[];
  terminals: Map<string, TerminalState>;
  currentMode: string | null;
  availableModes: SessionMode[];
  configOptions: SessionConfigOption[];
  availableModels: ModelInfo[];
  currentModelId: string | null;
  pendingPermission: PendingPermission | null;
  autoApprovePermissions: boolean;
  pendingElicitation: PendingElicitation | null;
  devboxId: string | null;
  axonId: string | null;
  sessionId: string | null;
  runloopUrl: string | null;
  availableCommands: AvailableCommand[];
  agentInfo: AgentInfo | null;
  connectionDetails: ConnectionDetails;
  authMethods: AuthMethod[];
  isAuthenticated: boolean;
  authDismissed: boolean;
  axonEvents: AxonEventView[];
  sessions: SessionListEntry[];
  isLoadingSessions: boolean;
  start: (config: { agentBinary: string; launchArgs?: string[]; launchCommands?: string[]; systemPrompt?: string }) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  setMode: (modeId: string) => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
  setConfigOption: (optionId: string, valueId: string) => Promise<void>;
  authenticate: (methodId: string) => Promise<void>;
  dismissAuth: () => void;
  respondToPermission: (requestId: string, optionId: string) => Promise<void>;
  cancelPermission: (requestId: string) => Promise<void>;
  setAutoApprovePermissions: (enabled: boolean) => Promise<void>;
  respondToElicitation: (requestId: string, action: ElicitationAction) => Promise<void>;
  shutdown: () => Promise<void>;
  createNewSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}
