import type { Express } from "express";
import type { AgentRegistry } from "../agent-registry.ts";

export function registerDebugRoutes(app: Express, registry: AgentRegistry) {
  app.get("/api/axon-events", (req, res) => {
    const agentId = req.query.agentId as string | undefined;
    if (!agentId) {
      res.json([]);
      return;
    }
    const entry = registry.get(agentId);
    if (!entry) {
      res.json([]);
      return;
    }
    const events =
      entry.agentType === "claude"
        ? (entry.claudeManager?.axonEvents ?? [])
        : (entry.acpManager?.axonEvents ?? []);
    res.json(events);
  });
}
