import type { Express } from "express";
import type { AgentRegistry } from "../agent-registry.ts";
import { asyncHandler, requireAgent } from "./helpers.ts";

export function registerClaudeRoutes(app: Express, registry: AgentRegistry) {
  app.post(
    "/api/control-response",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "claude" || !entry.claudeManager) {
        res.status(400).json({ error: "Not a Claude session" });
        return;
      }
      const { requestId, response } = req.body;
      if (!requestId) {
        res.status(400).json({ error: "requestId is required" });
        return;
      }
      if (!entry.claudeManager.resolveControlResponse(requestId, response)) {
        res
          .status(404)
          .json({ error: `No pending control request with id ${requestId}` });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/set-model",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;

      if (entry.agentType === "claude") {
        await entry.claudeManager!.setModel(req.body.model ?? req.body.modelId);
        res.json({ ok: true });
      } else {
        const { connection, sessionId } = entry.acpManager!.requireSession();
        res.json(
          await connection.protocol.unstable_setSessionModel({
            sessionId,
            modelId: req.body.modelId,
          }),
        );
      }
    }),
  );

  app.post(
    "/api/set-permission-mode",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "claude" || !entry.claudeManager) {
        res.status(400).json({ error: "Not a Claude session" });
        return;
      }
      await entry.claudeManager.setPermissionMode(req.body.mode);
      res.json({ ok: true });
    }),
  );

  app.post("/api/set-auto-approve-permissions", (req, res) => {
    const entry = requireAgent(req, res, registry);
    if (!entry) return;

    const { enabled } = req.body;
    if (entry.agentType === "acp" && entry.acpManager?.nodeClient) {
      entry.acpManager.nodeClient.autoApprovePermissions = !!enabled;
    }
    res.json({ ok: true, autoApprovePermissions: !!enabled });
  });
}
