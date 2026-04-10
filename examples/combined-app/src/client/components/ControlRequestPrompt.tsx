import { useState } from "react";
import type { PendingControlRequest, ControlRequestQuestion } from "../types.js";

export function ControlRequestPrompt({
  request,
  onRespond,
}: {
  request: PendingControlRequest;
  onRespond: (requestId: string, response: Record<string, unknown>) => void;
}) {
  const isAskUser = request.toolName === "AskUserQuestion";

  if (isAskUser && request.questions.length > 0) {
    return (
      <AskUserQuestionForm
        request={request}
        onRespond={onRespond}
      />
    );
  }

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

function AskUserQuestionForm({
  request,
  onRespond,
}: {
  request: PendingControlRequest;
  onRespond: (requestId: string, response: Record<string, unknown>) => void;
}) {
  // selections: question index -> selected label(s)
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() => new Map());

  const toggleOption = (qIndex: number, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(qIndex) ?? []);
      if (multiSelect) {
        current.has(label) ? current.delete(label) : current.add(label);
      } else {
        current.clear();
        current.add(label);
      }
      next.set(qIndex, current);
      return next;
    });
  };

  const allAnswered = request.questions.every(
    (_, i) => (selections.get(i)?.size ?? 0) > 0,
  );

  const handleSubmit = () => {
    const answers: Record<string, string> = {};
    request.questions.forEach((q, i) => {
      const selected = selections.get(i);
      if (selected && selected.size > 0) {
        answers[q.question] = Array.from(selected).join(", ");
      }
    });

    onRespond(request.requestId, {
      behavior: "allow",
      updatedInput: {
        questions: [],
        answers,
      },
    });
  };

  const handleDeny = () => {
    onRespond(request.requestId, { behavior: "deny" });
  };

  return (
    <div className="elicitation-form">
      {request.questions.map((q, qIndex) => (
        <QuestionCard
          key={qIndex}
          question={q}
          selected={selections.get(qIndex) ?? new Set()}
          onToggle={(label) => toggleOption(qIndex, label, q.multiSelect)}
        />
      ))}
      <div className="elicitation-actions">
        <button
          className="btn btn-primary elicitation-submit"
          onClick={handleSubmit}
          disabled={!allAnswered}
        >
          Submit
        </button>
        <button className="btn btn-ghost" onClick={handleDeny}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  selected,
  onToggle,
}: {
  question: ControlRequestQuestion;
  selected: Set<string>;
  onToggle: (label: string) => void;
}) {
  return (
    <div className="control-request-question">
      {question.header && (
        <div className="control-request-header">{question.header}</div>
      )}
      <div className="control-request-body">{question.question}</div>
      {question.multiSelect && (
        <div className="control-request-hint">Select all that apply</div>
      )}
      <div className="control-request-options">
        {question.options.map((opt) => {
          const isSelected = selected.has(opt.label);
          return (
            <button
              key={opt.label}
              className={`control-request-option ${isSelected ? "selected" : ""}`}
              onClick={() => onToggle(opt.label)}
            >
              <span className="control-request-option-indicator">
                {question.multiSelect
                  ? (isSelected ? "\u2611" : "\u2610")
                  : (isSelected ? "\u25C9" : "\u25CB")}
              </span>
              <span className="control-request-option-content">
                <span className="control-request-option-label">{opt.label}</span>
                {opt.description && (
                  <span className="control-request-option-desc">{opt.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
