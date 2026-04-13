import type { Express } from "express";
import type { AgentRegistry } from "../agent-registry.ts";
import { asyncHandler, requireAgent } from "./helpers.ts";

export function registerACPRoutes(app: Express, registry: AgentRegistry) {
  app.post(
    "/api/set-mode",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      const { connection, sessionId } = entry.acpManager!.requireSession();
      res.json(
        await connection.setSessionMode({ sessionId, modeId: req.body.modeId }),
      );
    }),
  );

  app.post(
    "/api/set-config-option",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      const { connection, sessionId } = entry.acpManager!.requireSession();
      res.json(
        await connection.setSessionConfigOption({
          sessionId,
          configId: req.body.configId,
          value: req.body.value,
        }),
      );
    }),
  );

  app.post(
    "/api/permission-response",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      entry
        .acpManager!.requireClient()
        .resolvePermission(req.body.requestId, { outcome: req.body.outcome });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/elicitation-response",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      entry
        .acpManager!.requireClient()
        .resolveElicitation(req.body.requestId, { action: req.body.action });
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/authenticate",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      res.json(
        await entry
          .acpManager!.requireConnection()
          .authenticate({ methodId: req.body.methodId }),
      );
    }),
  );

  app.post(
    "/api/new-session",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      const connection = entry.acpManager!.requireConnection();
      const resp = await connection.newSession({
        cwd: "/home/user",
        mcpServers: [],
      });
      entry.acpManager!.activeSessionId = resp.sessionId;
      res.json({
        sessionId: resp.sessionId,
        modes: resp.modes,
        configOptions: resp.configOptions,
        models: resp.models,
      });
    }),
  );

  app.post(
    "/api/switch-session",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      const connection = entry.acpManager!.requireConnection();
      const resp = await connection.loadSession({
        sessionId: req.body.sessionId,
        cwd: "/home/user",
        mcpServers: [],
      });
      entry.acpManager!.activeSessionId = req.body.sessionId;
      res.json(resp);
    }),
  );

  app.get(
    "/api/sessions",
    asyncHandler(async (req, res) => {
      const entry = requireAgent(req, res, registry);
      if (!entry) return;
      if (entry.agentType !== "acp") {
        res.status(400).json({ error: "Not an ACP session" });
        return;
      }
      res.json(await entry.acpManager!.requireConnection().listSessions({}));
    }),
  );
}
