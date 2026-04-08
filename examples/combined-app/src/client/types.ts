export type AgentType = "claude" | "acp";

export type ConnectionPhase = "idle" | "connecting" | "ready" | "error";

// --- Tool call types ---

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolCallLocation {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ContentItem {
  type: "content" | "diff" | "terminal";
  text?: string;
  diff?: DiffContent;
  terminal?: TerminalContent;
}

export interface DiffContent {
  path: string;
  oldText?: string | null;
  newText: string;
}

export interface TerminalContent {
  terminalId: string;
}

// --- Plan entry (unified todo + plan) ---

export type PlanEntryStatus = "pending" | "in_progress" | "completed";
export type PlanEntryPriority = "high" | "medium" | "low";

export interface PlanEntry {
  content: string;
  status: PlanEntryStatus;
  priority?: PlanEntryPriority | null;
}

// --- Turn block types ---

export interface ThinkingBlock {
  type: "thinking";
  id: string;
  text: string;
  duration: number | null;
  isActive: boolean;
  extra?: Record<string, unknown>;
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
  extra?: Record<string, unknown>;
}

export interface TextBlock {
  type: "text";
  id: string;
  text: string;
  messageId?: string | null;
  extra?: Record<string, unknown>;
}

export interface PlanBlock {
  type: "plan";
  id: string;
  entries: PlanEntry[];
  extra?: Record<string, unknown>;
}

export interface TaskBlock {
  type: "task";
  id: string;
  taskId: string;
  description: string;
  status: "started" | "in_progress" | "completed" | "failed" | "stopped";
  summary?: string;
  toolUses?: number;
  extra?: Record<string, unknown>;
}

export interface ResourceLinkBlock {
  type: "resource_link";
  id: string;
  uri: string;
  name?: string | null;
  title?: string | null;
  extra?: Record<string, unknown>;
}

export interface ImageBlock {
  type: "image";
  id: string;
  data: string;
  mimeType: string;
  uri?: string | null;
  extra?: Record<string, unknown>;
}

export interface AudioBlock {
  type: "audio";
  id: string;
  data: string;
  mimeType: string;
  extra?: Record<string, unknown>;
}

export interface EmbeddedResourceBlock {
  type: "resource";
  id: string;
  uri: string;
  mimeType?: string | null;
  text?: string;
  blob?: string;
  extra?: Record<string, unknown>;
}

// --- System init block (unified agent initialization) ---

export interface ClaudeInitExtensions {
  protocol: "claude";
  tools: string[];
  mcpServers: Array<{ name: string; status: string }>;
  permissionMode: string;
}

export interface ACPInitExtensions {
  protocol: "acp";
  protocolVersion: number | null;
  modes: SessionMode[];
  models: ModelInfo[];
  configOptions: SessionConfigOption[];
  agentCapabilities: AgentCapabilities | null;
  clientCapabilities: ClientCapabilities | null;
  authMethods: unknown[];
}

export interface SystemInitBlock {
  type: "system_init";
  id: string;
  agentName: string | null;
  agentVersion: string | null;
  model: string | null;
  commands: string[];
  extensions: ClaudeInitExtensions | ACPInitExtensions | null;
  extra: Record<string, unknown>;
}

export type TurnBlock =
  | ThinkingBlock
  | ToolCallBlock
  | TextBlock
  | PlanBlock
  | TaskBlock
  | ResourceLinkBlock
  | ImageBlock
  | AudioBlock
  | EmbeddedResourceBlock
  | SystemInitBlock;

// --- Chat message ---

export interface UserAttachment {
  type: "image" | "file";
  name?: string;
  data?: string;
  mimeType?: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: UserAttachment[];
  blocks?: TurnBlock[];
  stopReason?: string;
  cost?: number;
  numTurns?: number;
  durationMs?: number;
}

// --- Usage ---

export interface UsageState {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  size?: number;
  used?: number;
  cost?: number | null;
}

// --- Claude-specific: control request ---

export interface ControlRequestOption {
  label: string;
  description?: string;
}

export interface ControlRequestQuestion {
  header: string;
  question: string;
  multiSelect: boolean;
  options: ControlRequestOption[];
}

export interface PendingControlRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  questions: ControlRequestQuestion[];
  rawRequest: Record<string, unknown>;
}

// --- ACP-specific: permission ---

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: string;
  description?: string;
}

export interface PendingPermission {
  requestId: string;
  toolTitle: string;
  toolKind: string;
  toolCallId: string;
  rawInput?: unknown;
  options: PermissionOption[];
}

// --- ACP-specific: elicitation ---

export interface ElicitationFieldSchema {
  type: "string" | "number" | "integer" | "boolean" | "array";
  title?: string | null;
  description?: string | null;
  default?: unknown;
  enum?: string[] | null;
  oneOf?: Array<{ const: string; title: string }> | null;
  items?: { enum?: string[]; oneOf?: Array<{ const: string; title: string }> } | null;
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

// --- ACP-specific: session config ---

export interface SessionMode {
  id: string;
  name: string;
  description?: string;
}

export interface ModelInfo {
  modelId: string;
  name: string;
}

export interface AvailableCommandInput {
  hint: string;
}

export interface AvailableCommand {
  name: string;
  description?: string;
  input?: AvailableCommandInput | null;
}

export interface SessionConfigOption {
  id: string;
  type: string;
  name: string;
  currentValue?: string;
  options?: Array<{ value?: string; name: string; options?: Array<{ value?: string; name: string }> }>;
}

// --- ACP-specific: agent info ---

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

// --- Claude-specific: init info ---

export interface InitInfo {
  model: string;
  tools: string[];
  mcpServers: Array<{ name: string; status: string }>;
  permissionMode: string;
  slashCommands: string[];
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

export interface SessionListEntry {
  sessionId: string;
  title?: string;
  updatedAt?: string;
  cwd: string;
}

// --- Axon event (re-export shape) ---

export interface AxonEventView {
  id: string;
  axon_id: string;
  event_type: string;
  origin: string;
  payload: string;
  created_at: string;
  sequence: number;
  source: string;
  timestamp_ms: number;
  [key: string]: unknown;
}

// --- Start config types ---

export interface ClaudeStartConfig {
  blueprintName?: string;
  launchCommands?: string[];
  systemPrompt?: string;
  model?: string;
  autoApprovePermissions?: boolean;
}

export interface ACPStartConfig {
  agentBinary: string;
  launchArgs?: string[];
  launchCommands?: string[];
  systemPrompt?: string;
  autoApprovePermissions?: boolean;
}

export type StartConfig =
  | { agentType: "claude"; config: ClaudeStartConfig }
  | { agentType: "acp"; config: ACPStartConfig };

// --- Unified hook return type ---

export interface UseAgentReturn {
  agentType: AgentType | null;
  connectionPhase: ConnectionPhase;
  connectionStatus: string | null;
  error: string | null;
  messages: ChatMessage[];
  currentTurnBlocks: TurnBlock[];
  isAgentTurn: boolean;
  isStreaming: boolean;
  isSendingPrompt: boolean;
  usage: UsageState | null;

  // Claude-specific
  initInfo: InitInfo | null;
  permissionMode: string | null;
  currentModel: string | null;
  pendingControlRequest: PendingControlRequest | null;

  // ACP-specific
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
  pendingElicitation: PendingElicitation | null;
  agentInfo: AgentInfo | null;
  connectionDetails: ConnectionDetails;
  authMethods: unknown[];
  isAuthenticated: boolean;
  authDismissed: boolean;
  availableCommands: AvailableCommand[];
  sessions: SessionListEntry[];
  isLoadingSessions: boolean;

  // Common
  autoApprovePermissions: boolean;
  devboxId: string | null;
  axonId: string | null;
  sessionId: string | null;
  runloopUrl: string | null;
  axonEvents: AxonEventView[];

  // Actions
  start: (params: StartConfig) => Promise<void>;
  sendMessage: (text: string, content?: Array<{ type: string; [key: string]: unknown }>) => Promise<void>;
  cancel: () => Promise<void>;
  shutdown: () => Promise<void>;
  setAutoApprovePermissions: (enabled: boolean) => Promise<void>;

  // Claude actions
  setModel: (model: string) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
  sendControlResponse: (requestId: string, response: Record<string, unknown>) => Promise<void>;

  // ACP actions
  setMode: (modeId: string) => Promise<void>;
  setACPModel: (modelId: string) => Promise<void>;
  setConfigOption: (optionId: string, valueId: string) => Promise<void>;
  authenticate: (methodId: string) => Promise<void>;
  dismissAuth: () => void;
  respondToPermission: (requestId: string, optionId: string) => Promise<void>;
  cancelPermission: (requestId: string) => Promise<void>;
  respondToElicitation: (requestId: string, action: unknown) => Promise<void>;
  createNewSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}
