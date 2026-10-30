import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChatCircle,
  LightbulbFilament,
  PaperPlaneTilt,
  ThumbsUp,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  addComment,
  deleteCard,
  requestIdeaDrafts,
  toggleVote,
  updateCard,
  watchComments,
  watchVote,
} from "../lib/services.js";
import { CARD_COLOURS } from "../lib/demoData.js";

export function Modal({ title, description, onClose, children, className = "" }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
    dialog?.querySelector(focusableSelector)?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        ref={dialogRef}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function CardInspector({
  board,
  card,
  user,
  onClose,
  onDeleted,
  onNotice,
  onError,
}) {
  const [text, setText] = useState(card.text || "");
  const [url, setUrl] = useState(card.url || "");
  const [colour, setColour] = useState(card.colour || "yellow");
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [vote, setVote] = useState({
    count: card.voteCount || 0,
    voted: false,
  });
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = board.ownerId === user.uid;
  const canEdit =
    !board.locked &&
    (isOwner ||
      board.collaborationMode === "shared-edit" ||
      card.creatorId === user.uid);

  useEffect(() => {
    setText(card.text || "");
    setUrl(card.url || "");
    setColour(card.colour || "yellow");
  }, [card]);

  useEffect(
    () =>
      watchComments(board.id, card.id, setComments, (error) => onError(error)),
    [board.id, card.id, onError],
  );

  useEffect(
    () =>
      watchVote(board.id, card.id, user.uid, setVote, (error) =>
        onError(error),
      ),
    [board.id, card.id, user.uid, onError],
  );

  async function saveCard() {
    if (!canEdit) return;
    setSaving(true);
    try {
      const nextUrl = url.trim();
      if (
        card.type === "link" &&
        !/^https?:\/\/\S+$/i.test(nextUrl)
      ) {
        throw new Error("Enter a complete http:// or https:// link.");
      }
      const patch = {
        text: text.trim().slice(0, 600) || "Untitled idea",
        colour,
      };
      if (card.type === "link") {
        patch.url = nextUrl.slice(0, 2048);
      }
      await updateCard(board.id, card.id, patch);
      onNotice("Card saved");
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!commentText.trim() || board.locked) return;
    try {
      await addComment(board.id, card.id, user, commentText);
      setCommentText("");
    } catch (error) {
      onError(error);
    }
  }

  async function changeVote() {
    if (board.locked) return;
    try {
      await toggleVote(board.id, card.id, user.uid);
    } catch (error) {
      onError(error);
    }
  }

  async function removeCard() {
    if (!canEdit) return;
    setDeleting(true);
    try {
      await deleteCard(board.id, card.id);
      onDeleted();
      onNotice("Card removed");
    } catch (error) {
      onError(error);
      setDeleting(false);
    }
  }

  return (
    <aside className="inspector-panel" aria-label="Card details">
      <header>
        <div>
          <span className="eyebrow">{card.type} card</span>
          <h2>Card details</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close card details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      {board.locked && (
        <div className="panel-note">This board is locked. Content is read-only.</div>
      )}

      <label className="field">
        <span>Idea</span>
        <textarea
          value={text}
          maxLength={600}
          rows={5}
          onChange={(event) => setText(event.target.value)}
          disabled={!canEdit}
        />
      </label>

      {card.type === "link" && (
        <label className="field">
          <span>Link</span>
          <input
            value={url}
            type="url"
            onChange={(event) => setUrl(event.target.value)}
            disabled={!canEdit}
          />
        </label>
      )}

      <fieldset className="colour-picker" disabled={!canEdit}>
        <legend>Card colour</legend>
        <div>
          {Object.entries(CARD_COLOURS).map(([name, value]) => (
            <button
              key={name}
              type="button"
              className={colour === name ? "is-selected" : ""}
              style={{ background: value }}
              aria-label={`${name} card`}
              onClick={() => setColour(name)}
            >
              {colour === name && <Check size={15} weight="bold" />}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="inspector-actions">
        <button
          className="primary-button"
          type="button"
          onClick={saveCard}
          disabled={!canEdit || saving}
        >
          <Check size={18} weight="bold" />
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          className={`secondary-button ${vote.voted ? "is-voted" : ""}`}
          type="button"
          onClick={changeVote}
          disabled={board.locked}
        >
          <ThumbsUp size={18} weight={vote.voted ? "fill" : "regular"} />
          {vote.voted ? "Voted" : "Vote"} · {vote.count}
        </button>
        {canEdit && (
          confirmingDelete ? (
            <div className="inline-delete-confirm">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={removeCard}
                disabled={deleting}
              >
                <Trash size={17} />
                {deleting ? "Deleting…" : "Delete card"}
              </button>
            </div>
          ) : (
            <button
              className="danger-icon-button"
              type="button"
              aria-label="Delete card"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash size={18} />
            </button>
          )
        )}
      </div>

      <section className="comments-section">
        <div className="section-heading">
          <ChatCircle size={18} />
          <h3>Comments</h3>
          <span>{comments.length}</span>
        </div>
        <div className="comments-list">
          {comments.length === 0 && (
            <p className="empty-copy">Start the conversation around this idea.</p>
          )}
          {comments.map((comment) => (
            <article className="comment" key={comment.id}>
              <strong>{comment.authorName || "Collaborator"}</strong>
              <p>{comment.text}</p>
            </article>
          ))}
        </div>
        <form className="comment-form" onSubmit={submitComment}>
          <input
            value={commentText}
            maxLength={600}
            placeholder="Add a useful comment"
            onChange={(event) => setCommentText(event.target.value)}
            disabled={board.locked}
          />
          <button
            type="submit"
            aria-label="Send comment"
            disabled={board.locked || !commentText.trim()}
          >
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </form>
      </section>
    </aside>
  );
}

export function IdeasPanel({
  boardId,
  workspaceMode,
  onClose,
  onAccept,
  onNotice,
  onError,
}) {
  const [prompt, setPrompt] = useState("");
  const [contentMode, setContentMode] = useState(
    workspaceMode === "both" ? "both" : workspaceMode,
  );
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [source, setSource] = useState("");
  const lastRequestRef = useRef(0);

  useEffect(() => {
    setContentMode(workspaceMode === "both" ? "both" : workspaceMode);
    setPlan(null);
    setSource("");
  }, [workspaceMode]);

  function chooseContentMode(nextMode) {
    setContentMode(nextMode);
    setPlan(null);
    setSource("");
  }

  async function generate() {
    if (prompt.trim().length < 8) {
      onError(new Error("Describe what you want Gemini to add to the board."));
      return;
    }
    const now = Date.now();
    if (now - lastRequestRef.current < 10_000) {
      onError(new Error("Wait a few seconds before asking Gemini again."));
      return;
    }
    lastRequestRef.current = now;
    setLoading(true);
    setPlan(null);
    setSource("");
    try {
      const result = await requestIdeaDrafts(boardId, prompt, contentMode);
      setPlan(result.plan || null);
      setSource(result.source || "gemini");
      if (result.source === "fallback") {
        onNotice("Gemini is unavailable; showing a built-in starter plan");
      }
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  async function addPlan() {
    setAccepting(true);
    try {
      await onAccept(plan);
      onNotice("Gemini plan added to this canvas");
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <aside
      className="inspector-panel idea-panel"
      aria-label="Gemini board builder"
    >
      <header>
        <div className="gemini-panel-title">
          <img
            src="https://img.icons8.com/color/48/gemini-ai.png"
            alt=""
            width="36"
            height="36"
          />
          <div>
            <span className="eyebrow">AI Assistant</span>
            <h2>Build with Gemini</h2>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close Gemini"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      <div className="idea-intro gemini-intro">
        <LightbulbFilament size={24} weight="duotone" />
        <p>
          Describe the outcome you need. Gemini prepares{" "}
          <strong>
            {contentMode === "both"
              ? "linked notes and a mind map"
              : contentMode === "whiteboard"
                ? "sticky notes"
                : "a mind map"}
          </strong>
          , and you choose whether to add it.
        </p>
      </div>

      {workspaceMode === "both" && (
        <fieldset className="gemini-content-picker">
          <legend>Generate for this request</legend>
          <div>
            {[
              ["both", "Both"],
              ["whiteboard", "Notes only"],
              ["mindmap", "Mind map only"],
            ].map(([value, label]) => (
              <button
                className={contentMode === value ? "is-selected" : ""}
                type="button"
                key={value}
                aria-pressed={contentMode === value}
                onClick={() => chooseContentMode(value)}
                disabled={loading || accepting}
              >
                {label}
              </button>
            ))}
          </div>
          <small>
            Both links every map topic to a detailed supporting sticky note.
          </small>
        </fieldset>
      )}

      <label className="field gemini-prompt-field">
        <span>What should Gemini add?</span>
        <textarea
          value={prompt}
          maxLength={1200}
          rows={6}
          placeholder="Example: Create a launch plan with promotion ideas, event logistics, risks, and a clear final decision."
          onChange={(event) => setPrompt(event.target.value)}
          disabled={loading || accepting}
        />
        <small>{prompt.length}/1200</small>
      </label>

      <button
        className="gemini-generate-button full-button"
        type="button"
        onClick={generate}
        disabled={loading || accepting || prompt.trim().length < 8}
      >
        <img
          src="https://img.icons8.com/color/48/gemini-ai.png"
          alt=""
          width="22"
          height="22"
        />
        {loading ? "Gemini is thinking…" : "Create a board plan"}
      </button>

      {source === "demo" && (
        <p className="demo-label">
          Demo mode shows a built-in plan. The deployed app uses the protected
          Gemini proxy.
        </p>
      )}

      {source === "fallback" && (
        <p className="demo-label">
          Gemini could not answer, so a built-in starter plan is shown. The
          rest of Decision Board still works normally.
        </p>
      )}

      {source === "disabled" && (
        <p className="demo-label">
          A built-in plan is shown because the protected Gemini proxy has not
          been connected yet.
        </p>
      )}

      <p className="idea-privacy-note">
        For this request only, the prompt, board title, and up to 16 existing
        card or node texts are sent through the protected proxy. The API key
        never reaches this browser.
      </p>

      {plan && (
        <section className="gemini-plan-preview" aria-label="Gemini plan preview">
          <div className="gemini-plan-heading">
            <span>Preview</span>
            <small>
              {plan.notes.length} note{plan.notes.length === 1 ? "" : "s"} ·{" "}
              {plan.nodes.length} node{plan.nodes.length === 1 ? "" : "s"}
            </small>
          </div>
          <p className="gemini-summary">{plan.summary}</p>
          {plan.notes.length > 0 && (
            <div className="gemini-preview-group">
              <strong>Notes</strong>
              <ul>
                {plan.notes.map((note, index) => (
                  <li key={`${note.text}-${index}`}>{note.text}</li>
                ))}
              </ul>
            </div>
          )}
          {plan.nodes.length > 0 && (
            <div className="gemini-preview-group">
              <strong>Mind map</strong>
              <ul>
                {plan.nodes.map((node) => (
                  <li key={node.id}>
                    {node.text} <small>({node.shape})</small>
                  </li>
                ))}
              </ul>
              <small>
                {plan.edges.length} connection
                {plan.edges.length === 1 ? "" : "s"}
              </small>
            </div>
          )}
          <button
            className="primary-button full-button"
            type="button"
            onClick={addPlan}
            disabled={accepting}
          >
            <Check size={18} weight="bold" />
            {accepting ? "Adding to canvas…" : "Add this plan to the canvas"}
          </button>
        </section>
      )}
    </aside>
  );
}
