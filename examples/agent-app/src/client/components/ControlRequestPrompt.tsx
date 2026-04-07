import type { PendingControlRequest } from "../types.js";

export function ControlRequestPrompt({
  request,
  onRespond,
}: {
  request: PendingControlRequest;
  onRespond: (requestId: string, response: Record<string, unknown>) => void;
}) {
  const handleAllow = () => {
    onRespond(request.requestId, {
      behavior: "allow",
      updatedInput: request.rawRequest.request,
    });
  };

  const handleDeny = () => {
    onRespond(request.requestId, { behavior: "deny" });
  };

  return (
    <div className="elicitation-form">
      <div className="elicitation-message">
        Permission requested: <strong>{request.toolName}</strong>
      </div>
      {request.questions.length > 0 && (
        <div className="control-request-questions">
          {request.questions.map((q, i) => (
            <div key={i} className="control-request-question">
              <div className="control-request-header">{q.header}</div>
              <div className="control-request-body">{q.question}</div>
            </div>
          ))}
        </div>
      )}
      <div className="permission-actions">
        <button className="btn permission-btn permission-btn-allow" onClick={handleAllow}>
          Allow
        </button>
        <button className="btn permission-btn permission-btn-reject" onClick={handleDeny}>
          Deny
        </button>
      </div>
    </div>
  );
}
