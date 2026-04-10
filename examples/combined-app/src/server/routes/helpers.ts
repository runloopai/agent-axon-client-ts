import type { Request, Response } from "express";
import type { AgentRegistry } from "../agent-registry.ts";
import { HttpError } from "../http-errors.ts";

export type AsyncHandler = (req: Request, res: Response) => Promise<void>;

export function asyncHandler(fn: AsyncHandler): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status >= 500) console.error("Server error:", err);
      res.status(status).json({ error: message });
    });
  };
}

export function requireAgent(req: Request, res: Response, registry: AgentRegistry) {
  const agentId = req.body?.agentId ?? req.query?.agentId;
  if (!agentId) {
    res.status(400).json({ error: "agentId is required" });
    return null;
  }
  const entry = registry.get(agentId as string);
  if (!entry) {
    res.status(404).json({ error: `Agent ${agentId} not found` });
    return null;
  }
  return entry;
}
