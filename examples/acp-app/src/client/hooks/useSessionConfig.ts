import { useState, useCallback } from "react";
import type { SessionUpdate } from "@runloop/agent-axon-client/acp";
import {
  isCurrentModeUpdate,
  isConfigOptionUpdate,
  isAvailableCommandsUpdate,
} from "@runloop/agent-axon-client/acp";
import type {
  SessionMode,
  ModelInfo,
  AvailableCommand,
  SessionConfigOption,
} from "./types.js";
import { api } from "./api.js";

export interface UseSessionConfigReturn {
  currentMode: string | null;
  availableModes: SessionMode[];
  configOptions: SessionConfigOption[];
  availableModels: ModelInfo[];
  currentModelId: string | null;
  availableCommands: AvailableCommand[];
  setMode: (modeId: string) => Promise<void>;
  setModel: (modelId: string) => Promise<void>;
  setConfigOption: (optionId: string, valueId: string) => Promise<void>;
  applySessionResponse: (resp: Record<string, unknown>) => void;
  onSessionUpdate: (update: SessionUpdate) => void;
}

export function useSessionConfig(
  setError: (err: string) => void,
): UseSessionConfigReturn {
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [availableModes, setAvailableModes] = useState<SessionMode[]>([]);
  const [configOptions, setConfigOptions] = useState<SessionConfigOption[]>([]);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string | null>(null);
  const [availableCommands, setAvailableCommands] = useState<AvailableCommand[]>([]);

  const applySessionResponse = useCallback((resp: Record<string, unknown>) => {
    const modes = resp.modes as { availableModes?: SessionMode[]; currentModeId?: string } | undefined;
    if (modes?.availableModes) setAvailableModes(modes.availableModes);
    if (modes?.currentModeId) setCurrentMode(modes.currentModeId);
    const opts = resp.configOptions as SessionConfigOption[] | undefined;
    if (opts) setConfigOptions(opts);
    const models = resp.models as { availableModels?: ModelInfo[]; currentModelId?: string } | undefined;
    if (models?.availableModels) setAvailableModels(models.availableModels);
    if (models?.currentModelId) setCurrentModelId(models.currentModelId);
  }, []);

  const setMode = useCallback(async (modeId: string) => {
    setCurrentMode(modeId);
    try { await api("/api/set-mode", { modeId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  const setModel = useCallback(async (modelId: string) => {
    setCurrentModelId(modelId);
    try { await api("/api/set-model", { modelId }); } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  const setConfigOption = useCallback(async (optionId: string, valueId: string) => {
    try {
      const resp = await api<{ configOptions?: SessionConfigOption[] }>("/api/set-config-option", { configId: optionId, value: valueId });
      if (resp.configOptions) setConfigOptions(resp.configOptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setError]);

  const onSessionUpdate = useCallback((update: SessionUpdate) => {
    if (isCurrentModeUpdate(update)) {
      setCurrentMode(update.currentModeId);
    } else if (isConfigOptionUpdate(update)) {
      setConfigOptions(update.configOptions as unknown as SessionConfigOption[]);
    } else if (isAvailableCommandsUpdate(update)) {
      setAvailableCommands(update.availableCommands);
    }
  }, []);

  return {
    currentMode,
    availableModes,
    configOptions,
    availableModels,
    currentModelId,
    availableCommands,
    setMode,
    setModel,
    setConfigOption,
    applySessionResponse,
    onSessionUpdate,
  };
}
