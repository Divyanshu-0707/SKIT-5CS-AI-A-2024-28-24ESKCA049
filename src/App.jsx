import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  Export,
  GearSix,
  LightbulbFilament,
  LinkSimple,
  Lock,
  LockOpen,
  Note,
  Plus,
  ShareNetwork,
  SignOut,
  SpinnerGap,
  Trash,
  Users,
  X,
} from "@phosphor-icons/react";
import { BoardCard } from "./components/BoardCard.jsx";
import { CardEdgeLayer } from "./components/CardEdgeLayer.jsx";
import { MindMapLayer } from "./components/MindMapLayer.jsx";
import {
  CardInspector,
  IdeasPanel,
  Modal,
} from "./components/Panels.jsx";
import {
  continueAsGuest,
  createBoard,
  createCard,
  deleteCard,
  deleteCardEdge,
  deleteBoard,
  joinBoard,
  loginWithGoogle,
  loginUser,
  logoutUser,
  registerUser,
  saveMindEdge,
  saveMindNode,
  saveCardEdge,
  updateBoard,
  updateCard,
  upgradeGuestWithGoogle,
  watchAuth,
  watchBoard,
  watchBoards,
  watchCards,
  watchCardEdges,
  watchMindMap,
} from "./lib/services.js";
import { firebaseConfigError, firebaseMode } from "./lib/firebase.js";
import {
  CARD_COLOURS,
  DEMO_BOARD_ID,
  makeId,
} from "./lib/demoData.js";
import {
  normalizeArrowType,
  normalizeEdgeShape,
  normalizeNodeShape,
} from "./lib/mindMapGeometry.js";

const WORKSPACE_MODES = [
  {
    value: "whiteboard",
    label: "Whiteboard",
    description: "Text cards and links",
  },
  {
    value: "mindmap",
    label: "Mind Map",
    description: "Nodes and connections",
  },
  {
    value: "both",
    label: "Both",
    description: "Cards and mind maps on one canvas",
  },
];

const MIND_NODE_COLOURS = [
  "#E9E1FF",
  "#FFF4B8",
  "#DDF7E8",
  "#DDEEFF",
  "#FFE0D6",
];

function normaliseWorkspaceMode(value) {
  return WORKSPACE_MODES.some((mode) => mode.value === value) ? value : "both";
}

function workspaceModeLabel(value) {
  return WORKSPACE_MODES.find((mode) => mode.value === value)?.label || "Both";
}

function currentBoardId() {
  const match = window.location.hash.match(/^#\/board\/([^/]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function goHome() {
  window.location.hash = "#/";
}

function openBoard(boardId) {
  window.location.hash = `#/board/${encodeURIComponent(boardId)}`;
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Use the selection fallback below.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("The browser did not allow copying.");
}

function AppLogo({ compact = false }) {
  return (
    <div className={`app-logo ${compact ? "is-compact" : ""}`}>
      <span>
        <img
          src="/decision-board-logo.png"
          alt=""
          width={compact ? 32 : 34}
          height={compact ? 32 : 34}
        />
      </span>
      {!compact && <strong>Decision Board</strong>}
    </div>
  );
}

function WorkspaceModePicker({ value, onChange }) {
  return (
    <fieldset className="workspace-mode-picker">
      <legend>Workspace content</legend>
      <div>
        {WORKSPACE_MODES.map((mode) => (
          <label
            key={mode.value}
            className={value === mode.value ? "is-selected" : ""}
          >
            <input
              type="radio"
              name="workspaceMode"
              value={mode.value}
              checked={value === mode.value}
              onChange={(event) => onChange(event.target.value)}
            />
            <strong>{mode.label}</strong>
            <span>{mode.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AuthScreen({ boardId, onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let nextUser;
      if (mode === "register") {
        nextUser = await registerUser(name, email, password);
      } else {
        nextUser = await loginUser(email, password);
      }
      onAuthenticated(nextUser);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function guestAccess() {
    setBusy(true);
    setError("");
    try {
      const nextUser = await continueAsGuest();
      onAuthenticated(nextUser);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function googleAccess() {
    setBusy(true);
    setError("");
    try {
      const nextUser = await loginWithGoogle();
      onAuthenticated(nextUser);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <AppLogo />
        <div className="auth-copy">
          <span className="eyebrow">From scattered ideas to one outcome</span>
          <h1>Make the decision visible.</h1>
          <p>
            Collect the team’s ideas, connect the context, and leave every
            discussion with a clear shared result.
          </p>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs" role="group" aria-label="Account action">
          <button
            type="button"
            aria-pressed={mode === "login"}
            className={mode === "login" ? "is-active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            className={mode === "register" ? "is-active" : ""}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>

        <div className="auth-heading">
          <h2>
            {mode === "register"
              ? "Create your workspace"
              : boardId
                ? "Join this shared board"
                : "Welcome back"}
          </h2>
          <p>
            {mode === "register"
              ? "Start a board and invite collaborators with one link."
              : boardId
                ? "Sign in with Google or email. Shared boards are available only to signed-in accounts."
              : "Open the boards where your team is thinking together."}
          </p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              type="email"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              type="password"
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>
            {busy && <SpinnerGap className="spin" size={18} />}
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>
        <button
          className="google-button full-button"
          type="button"
          onClick={googleAccess}
          disabled={busy}
        >
          <img
            src="https://img.icons8.com/color/48/google-logo.png"
            alt=""
            width="20"
            height="20"
          />
          Continue with Google
        </button>
        {!boardId && (
          <button
            className="guest-button"
            type="button"
            onClick={guestAccess}
            disabled={busy}
          >
            Try privately as a guest
          </button>
        )}
      </section>
    </main>
  );
}

function CreateBoardModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState("both");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onCreate(title, workspaceMode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Start a decision board"
      description="Give the discussion a clear outcome to work toward."
      onClose={onClose}
      className="small-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span>Board name</span>
          <input
            autoFocus
            value={title}
            maxLength={80}
            placeholder="Example: Product launch decision"
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <WorkspaceModePicker
          value={workspaceMode}
          onChange={setWorkspaceMode}
        />
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create board"}
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BoardSettingsModal({ board, onClose, onSave, onDelete }) {
  const [accessMode, setAccessMode] = useState(board.accessMode);
  const [collaborationMode, setCollaborationMode] = useState(
    board.collaborationMode,
  );
  const [workspaceMode, setWorkspaceMode] = useState(
    normaliseWorkspaceMode(board.workspaceMode),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ accessMode, collaborationMode, workspaceMode });
      onClose();
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeBoard() {
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (nextError) {
      setError(nextError.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={confirmingDelete ? "Delete this board?" : "Board settings"}
      description={
        confirmingDelete
          ? "This permanently removes the board, its cards, comments, votes, and mind map."
          : "Choose who can open the board and how collaborators may edit it."
      }
      onClose={onClose}
      className="small-modal"
    >
      {confirmingDelete ? (
        <div className="modal-form">
          <p className="confirmation-copy">
            Type <strong>{board.title}</strong> to confirm.
          </p>
          <label className="field">
            <span>Board name</span>
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                setConfirmation("");
                setError("");
              }}
              disabled={busy}
            >
              Keep board
            </button>
            <button
              className="danger-button"
              type="button"
              onClick={removeBoard}
              disabled={busy || confirmation !== board.title}
            >
              <Trash size={17} />
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      ) : (
        <form className="modal-form" onSubmit={save}>
          <label className="field">
            <span>Board access</span>
            <select
              value={accessMode}
              onChange={(event) => setAccessMode(event.target.value)}
            >
              <option value="link">Anyone with the link</option>
              <option value="private">Members only</option>
            </select>
          </label>
          <label className="field">
            <span>Editing permission</span>
            <select
              value={collaborationMode}
              onChange={(event) => setCollaborationMode(event.target.value)}
            >
              <option value="shared-edit">Everyone can edit board items</option>
              <option value="own-items">People edit only their own items</option>
            </select>
          </label>
          <WorkspaceModePicker
            value={workspaceMode}
            onChange={setWorkspaceMode}
          />
          <p className="workspace-mode-note">
            Changing this only hides or shows content. Existing cards and
            mind-map nodes stay saved.
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="danger-zone">
            <div>
              <strong>Delete board</strong>
              <span>This cannot be undone.</span>
            </div>
            <button
              className="danger-link"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Dashboard({ user, onError, onNotice }) {
  const [boards, setBoards] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    return watchBoards(
      user,
      (nextBoards) => {
        setBoards(nextBoards);
        setLoadError("");
        setLoading(false);
      },
      (error) => {
        setLoadError(error.message);
        onError(error);
        setLoading(false);
      },
    );
  }, [user, onError, loadVersion]);

  async function addBoard(title, workspaceMode) {
    try {
      const boardId = await createBoard(user, title, workspaceMode);
      setShowCreate(false);
      openBoard(boardId);
    } catch (error) {
      onError(error);
    }
  }

  async function connectGoogle() {
    try {
      await upgradeGuestWithGoogle();
      onNotice("Guest account connected to Google");
    } catch (error) {
      onError(error);
    }
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-nav">
        <AppLogo />
        <div className="dashboard-account">
          {firebaseMode === "demo" && <span className="mode-pill">Demo mode</span>}
          <span className="user-name">{user.displayName}</span>
          {firebaseMode === "firebase" && user.isAnonymous && (
            <button
              className="google-upgrade-button"
              type="button"
              onClick={connectGoogle}
            >
              <img
                src="https://img.icons8.com/color/48/google-logo.png"
                alt=""
                width="18"
                height="18"
              />
              Sign in to share
            </button>
          )}
          {firebaseMode === "firebase" && (
            <button
              className="icon-button"
              type="button"
              aria-label="Sign out"
              onClick={logoutUser}
            >
              <SignOut size={19} />
            </button>
          )}
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Your shared thinking space</span>
          <h1>Where ideas become a decision.</h1>
          <p>
            Open a board, invite the right people, and organise the discussion
            into one clear outcome.
          </p>
        </div>
        <button
          className="primary-button create-board-button"
          type="button"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={19} weight="bold" />
          New board
        </button>
      </section>

      <section className="boards-section">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Shared work</span>
            <h2>Your boards</h2>
          </div>
          <span>{boards.length} total</span>
        </div>

        {loading ? (
          <div className="loading-row">
            <SpinnerGap className="spin" size={22} />
            Loading boards…
          </div>
        ) : loadError ? (
          <div className="boards-load-error" role="alert">
            <strong>Your boards could not load</strong>
            <span>{loadError}</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setLoadVersion((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : boards.length === 0 ? (
          <button
            className="empty-board-state"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={26} />
            <strong>Create your first board</strong>
            <span>Start with a decision, then invite your team.</span>
          </button>
        ) : (
          <div className="board-list">
            {boards.map((board, index) => (
              <button
                className="board-list-item"
                type="button"
                key={board.id}
                onClick={() => openBoard(board.id)}
              >
                <span
                  className={`board-colour board-colour-${(index % 4) + 1}`}
                  aria-hidden="true"
                >
                  <LightbulbFilament size={23} weight="duotone" />
                </span>
                <span className="board-list-copy">
                  <strong>{board.title}</strong>
                  <small>
                    {workspaceModeLabel(
                      normaliseWorkspaceMode(board.workspaceMode),
                    )}{" "}
                    · {board.locked ? "Locked" : "Open for ideas"} ·{" "}
                    {board.memberCount || 1} collaborator
                    {(board.memberCount || 1) === 1 ? "" : "s"}
                  </small>
                </span>
                <ArrowRight size={20} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-principle">
        <span>Decision Board keeps the flow simple</span>
        <div>
          <p><strong>1</strong> Collect the context</p>
          <p><strong>2</strong> Connect the strongest ideas</p>
          <p><strong>3</strong> Agree on the outcome</p>
        </div>
      </section>

      {showCreate && (
        <CreateBoardModal
          onClose={() => setShowCreate(false)}
          onCreate={addBoard}
        />
      )}
    </main>
  );
}

function LinkCardModal({ onClose, onCreate }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  function submit(event) {
    event.preventDefault();
    const nextUrl = /^https?:\/\//i.test(url.trim())
      ? url.trim()
      : `https://${url.trim()}`;
    onCreate({
      text: text.trim() || "Useful reference",
      url: nextUrl,
    });
  }

  return (
    <Modal
      title="Add a link card"
      description="Keep useful context beside the ideas it supports."
      onClose={onClose}
      className="small-modal"
    >
      <form className="modal-form" onSubmit={submit}>
        <label className="field">
          <span>Label</span>
          <input
            autoFocus
            value={text}
            maxLength={140}
            placeholder="Research notes"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="field">
          <span>URL</span>
          <input
            value={url}
            type="text"
            placeholder="example.com/research"
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={!url.trim()}>
            Add link
            <LinkSimple size={17} weight="bold" />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ToolButton({ icon, label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      className={active ? "is-active" : ""}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-pressed={typeof active === "boolean" ? active : undefined}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function BoardView({ boardId, user, onError, onNotice }) {
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [cardEdges, setCardEdges] = useState({});
  const [mindMap, setMindMap] = useState({ nodes: {}, edges: {} });
  const [selectedCard, setSelectedCard] = useState(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [mindActive, setMindActive] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [joinState, setJoinState] = useState("joining");
  const [cardsReady, setCardsReady] = useState(false);
  const [cardEdgesReady, setCardEdgesReady] = useState(false);
  const [mindMapReady, setMindMapReady] = useState(false);
  const [contentError, setContentError] = useState("");
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [cardConnectFrom, setCardConnectFrom] = useState(null);
  const [cardEdgeActive, setCardEdgeActive] = useState(false);
  const [noteToolbarConfirmDelete, setNoteToolbarConfirmDelete] =
    useState(false);
  const [noteToolbarBusy, setNoteToolbarBusy] = useState(false);
  const exportRef = useRef(null);
  const canvasViewportRef = useRef(null);
  const deletingBoardRef = useRef(false);
  const shareTimerRef = useRef(null);
  const isOwner = board?.ownerId === user.uid;
  const canAdd =
    board && !board.locked && !board.deleting && joinState === "joined";
  const workspaceMode = normaliseWorkspaceMode(board?.workspaceMode);
  const showWhiteboard =
    workspaceMode === "whiteboard" || workspaceMode === "both";
  const showMindMap = workspaceMode === "mindmap" || workspaceMode === "both";
  const visibleContentReady =
    (!showWhiteboard || (cardsReady && cardEdgesReady)) &&
    (!showMindMap || mindMapReady);
  const visibleWorkspaceEmpty =
    (!showWhiteboard || cards.length === 0) &&
    (!showMindMap || Object.keys(mindMap.nodes || {}).length === 0);

  useEffect(() => {
    let cancelled = false;
    setBoard(null);
    setCards([]);
    setCardEdges({});
    setMindMap({ nodes: {}, edges: {} });
    setLoading(true);
    setCardsReady(false);
    setCardEdgesReady(false);
    setMindMapReady(false);
    setContentError("");
    setJoinState("joining");
    joinBoard(boardId, user)
      .then(() => {
        if (!cancelled) setJoinState("joined");
      })
      .catch((error) => {
        if (!cancelled) {
          setJoinState("error");
          setLoading(false);
          onError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, user, onError]);

  useEffect(
    () => {
      if (joinState !== "joined") return undefined;
      return watchBoard(
        boardId,
        (nextBoard) => {
          setBoard(nextBoard);
          setTitleDraft(nextBoard?.title || "");
          setLoading(false);
        },
        (error) => {
          if (deletingBoardRef.current) return;
          onError(error);
          setLoading(false);
        },
      );
    },
    [boardId, joinState, onError, subscriptionVersion],
  );

  useEffect(
    () => {
      if (joinState !== "joined" || !board) return undefined;
      setCardEdgesReady(false);
      if (!showWhiteboard) {
        setCardEdges({});
        setCardEdgesReady(true);
        return undefined;
      }
      return watchCardEdges(
        boardId,
        (nextEdges) => {
          setCardEdges(nextEdges);
          setCardEdgesReady(true);
        },
        (error) => {
          setCardEdgesReady(true);
          setContentError(error.message);
          onError(error);
        },
      );
    },
    [
      boardId,
      board,
      joinState,
      onError,
      showWhiteboard,
      subscriptionVersion,
    ],
  );

  useEffect(
    () => {
      if (joinState !== "joined" || !board) return undefined;
      setCardsReady(false);
      if (!showWhiteboard) {
        setCards([]);
        setCardsReady(true);
        return undefined;
      }
      return watchCards(
        boardId,
        (nextCards) => {
          setCards(nextCards);
          setCardsReady(true);
        },
        (error) => {
          setCardsReady(true);
          setContentError(error.message);
          onError(error);
        },
      );
    },
    [
      boardId,
      board,
      joinState,
      onError,
      showWhiteboard,
      subscriptionVersion,
    ],
  );

  useEffect(
    () => {
      if (joinState !== "joined" || !board) return undefined;
      setMindMapReady(false);
      if (!showMindMap) {
        setMindMap({ nodes: {}, edges: {} });
        setMindMapReady(true);
        return undefined;
      }
      return watchMindMap(
        boardId,
        (nextMindMap) => {
          setMindMap(nextMindMap);
          setMindMapReady(true);
        },
        (error) => {
          setMindMapReady(true);
          setContentError(error.message);
          onError(error);
        },
      );
    },
    [
      boardId,
      board,
      joinState,
      onError,
      showMindMap,
      subscriptionVersion,
    ],
  );

  useEffect(() => {
    if (!selectedCard) return;
    const freshCard = cards.find((card) => card.id === selectedCard.id);
    if (!freshCard) setSelectedCard(null);
    else if (freshCard !== selectedCard) setSelectedCard(freshCard);
  }, [cards, selectedCard]);

  useEffect(() => {
    setNoteToolbarConfirmDelete(false);
    setNoteToolbarBusy(false);
  }, [selectedCard?.id]);

  useEffect(() => {
    if (selectedCard || mindActive || ideasOpen || linkModalOpen) {
      setCardEdgeActive(false);
    }
  }, [ideasOpen, linkModalOpen, mindActive, selectedCard]);

  useEffect(() => {
    if (!showWhiteboard) {
      setSelectedCard(null);
      setLinkModalOpen(false);
      setCardConnectFrom(null);
    }
    if (!showMindMap) setMindActive(false);
  }, [showMindMap, showWhiteboard]);

  useEffect(
    () => () => {
      window.clearTimeout(shareTimerRef.current);
    },
    [],
  );

  function existingCanvasRectangles() {
    return [
      ...cards.map((card) => ({
        x: card.x,
        y: card.y,
        width: card.width || 246,
        height: card.height || 176,
      })),
      ...Object.values(mindMap.nodes || {}).map((node) => ({
        x: node.x,
        y: node.y,
        width: node.w || 210,
        height: node.h || 72,
      })),
    ];
  }

  function rectanglesOverlap(first, second, gap = 22) {
    return !(
      first.x + first.width + gap <= second.x ||
      second.x + second.width + gap <= first.x ||
      first.y + first.height + gap <= second.y ||
      second.y + second.height + gap <= first.y
    );
  }

  function findOpenPosition(width, height, candidates, occupied, gap = 22) {
    return (
      candidates.find((candidate) => {
        const rectangle = { ...candidate, width, height };
        return (
          candidate.x >= 24 &&
          candidate.y >= 72 &&
          candidate.x + width <= 1576 &&
          candidate.y + height <= 956 &&
          !occupied.some((item) => rectanglesOverlap(rectangle, item, gap))
        );
      }) || null
    );
  }

  function scanCanvasCandidates(width, height, step = 18) {
    const candidates = [];
    for (let y = 72; y + height <= 956; y += step) {
      for (let x = 24; x + width <= 1576; x += step) {
        candidates.push({ x, y });
      }
    }
    return candidates;
  }

  function cardPositionCandidates() {
    const preferred = [120, 340, 560, 780].flatMap((y) =>
      [90, 380, 670, 960, 1250].map((x) => ({ x, y })),
    );
    return [...preferred, ...scanCanvasCandidates(268, 196)];
  }

  function nodePositionCandidates() {
    const preferred = [150, 290, 430, 570, 710, 840].flatMap((y) =>
      [110, 380, 650, 920, 1190].map((x) => ({ x, y })),
    );
    return [...preferred, ...scanCanvasCandidates(210, 104)];
  }

  function nextCardPosition(offset = 0) {
    const occupied = existingCanvasRectangles();
    const available = cardPositionCandidates().filter((candidate) =>
      findOpenPosition(246, 176, [candidate], occupied),
    );
    return available[offset] || null;
  }

  function nextMindNodePosition(offset = 0) {
    const occupied = existingCanvasRectangles();
    const available = nodePositionCandidates().filter((candidate) =>
      findOpenPosition(210, 72, [candidate], occupied),
    );
    return available[offset] || null;
  }

  async function addTextCard(
    text = "Write the idea here…",
    offset = 0,
    { propagateError = false, position: suppliedPosition } = {},
  ) {
    if (!canAdd) {
      const error = new Error("The board is locked.");
      if (propagateError) throw error;
      onError(error);
      return null;
    }
    const id = makeId("card");
    const position = suppliedPosition || nextCardPosition(offset);
    if (!position) {
      const error = new Error(
        "The card grid is full. Move or delete a card first.",
      );
      if (propagateError) throw error;
      onError(error);
      return null;
    }
    const card = {
      id,
      creatorId: user.uid,
      creatorName: user.displayName,
      type: "text",
      text,
      ...position,
      width: 246,
      height: 176,
      colour: Object.keys(CARD_COLOURS)[(cards.length + offset) % 5],
    };
    try {
      await createCard(boardId, card);
      setSelectedCard(card);
      setIdeasOpen(false);
      onNotice("Text card added");
      return id;
    } catch (error) {
      if (propagateError) throw error;
      onError(error);
      return null;
    }
  }

  async function addLinkCard(values) {
    const id = makeId("card");
    const position = nextCardPosition();
    if (!position) {
      onError(new Error("The card grid is full. Move or delete a card first."));
      return;
    }
    try {
      await createCard(boardId, {
        id,
        creatorId: user.uid,
        creatorName: user.displayName,
        type: "link",
        ...values,
        ...position,
        width: 270,
        height: 170,
        colour: "blue",
      });
      setLinkModalOpen(false);
      onNotice("Link card added");
    } catch (error) {
      onError(error);
    }
  }

  async function moveCard(cardId, position) {
    try {
      await updateCard(boardId, cardId, position);
    } catch (error) {
      onError(error);
      throw error;
    }
  }

  async function recolourCard(cardId, colour) {
    try {
      await updateCard(boardId, cardId, { colour });
      onNotice("Card colour changed");
    } catch (error) {
      onError(error);
      throw error;
    }
  }

  async function removeCardFromMenu(cardId) {
    try {
      await deleteCard(boardId, cardId);
      setSelectedCard((current) => (current?.id === cardId ? null : current));
      setCardConnectFrom((current) => (current === cardId ? null : current));
      onNotice("Card deleted");
    } catch (error) {
      onError(error);
      throw error;
    }
  }

  async function removeSelectedCardFromToolbar() {
    if (!selectedCard || noteToolbarBusy) return;
    setNoteToolbarBusy(true);
    try {
      await removeCardFromMenu(selectedCard.id);
      setNoteToolbarConfirmDelete(false);
    } catch {
      setNoteToolbarBusy(false);
    }
  }

  function toggleCardConnection(cardId) {
    setCardConnectFrom((current) => {
      const next = current === cardId ? null : cardId;
      onNotice(
        next
          ? "Choose a second sticky note to connect"
          : "Note connection cancelled",
      );
      return next;
    });
    setSelectedCard(null);
    setIdeasOpen(false);
  }

  async function createCardConnection(toId) {
    const fromId = cardConnectFrom;
    if (!fromId || fromId === toId) {
      setCardConnectFrom(null);
      return;
    }
    const fromCard = cards.find((card) => card.id === fromId);
    const toCard = cards.find((card) => card.id === toId);
    if (fromCard?.type !== "text" || toCard?.type !== "text") {
      setCardConnectFrom(null);
      return onError(new Error("Only sticky notes can be connected."));
    }
    const duplicate = Object.values(cardEdges).some(
      (edge) =>
        (edge.from === fromId && edge.to === toId) ||
        (edge.from === toId && edge.to === fromId),
    );
    if (duplicate) {
      setCardConnectFrom(null);
      return onNotice("Those sticky notes are already connected");
    }
    try {
      await saveCardEdge(
        boardId,
        {
          id: makeId("cardedge"),
          from: fromId,
          to: toId,
          colorCode: "#7E749B",
          dashed: false,
          shape: "straight",
          arrowType: "arrow",
        },
        user.uid,
      );
      setCardConnectFrom(null);
      onNotice("Sticky notes connected");
    } catch (error) {
      onError(error);
    }
  }

  async function updateCardConnection(edge, patch) {
    await saveCardEdge(boardId, { ...edge, ...patch }, user.uid);
  }

  async function removeCardConnection(edgeId) {
    await deleteCardEdge(boardId, edgeId);
  }

  function openLinkedCard(cardId, nodeText) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) {
      onError(new Error("The linked sticky note is no longer available."));
      return;
    }
    setSelectedCard(card);
    setIdeasOpen(false);
    setMindActive(false);
    const viewport = canvasViewportRef.current;
    if (viewport) {
      window.requestAnimationFrame(() => {
        viewport.scrollTo({
          left: Math.max(
            0,
            card.x + (card.width || 246) / 2 - viewport.clientWidth / 2,
          ),
          top: Math.max(
            0,
            card.y + (card.height || 176) / 2 - viewport.clientHeight / 2,
          ),
          behavior: "smooth",
        });
      });
    }
    onNotice(`Opened the detailed note for “${nodeText}”`);
  }

  function beginCanvasPan(event) {
    if (
      event.button !== 0 ||
      event.pointerType === "touch" ||
      event.target.closest(
        ".board-card, .mind-node, .mind-tools, button, a, input, textarea, select",
      )
    ) {
      return;
    }
    const viewport = event.currentTarget;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    let moved = false;

    function move(moveEvent) {
      const deltaX = moveEvent.clientX - start.pointerX;
      const deltaY = moveEvent.clientY - start.pointerY;
      if (!moved && Math.hypot(deltaX, deltaY) < 5) return;
      moved = true;
      viewport.classList.add("is-panning");
      viewport.scrollLeft = start.scrollLeft - deltaX;
      viewport.scrollTop = start.scrollTop - deltaY;
    }

    function cleanUp() {
      viewport.classList.remove("is-panning");
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", finish);
      viewport.removeEventListener("pointercancel", cancel);
    }

    function finish() {
      cleanUp();
      if (!moved) setSelectedCard(null);
    }

    function cancel() {
      cleanUp();
    }

    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", finish, { once: true });
    viewport.addEventListener("pointercancel", cancel, { once: true });
  }

  async function saveBoardSettings(patch) {
    await updateBoard(boardId, patch, user.uid);
    onNotice("Board settings saved");
  }

  async function removeBoard() {
    deletingBoardRef.current = true;
    try {
      await deleteBoard(boardId);
      setSettingsOpen(false);
      goHome();
      onNotice("Board deleted");
    } catch (error) {
      deletingBoardRef.current = false;
      throw error;
    }
  }

  async function renameBoard() {
    if (!isOwner || !titleDraft.trim()) return;
    try {
      await updateBoard(
        boardId,
        { title: titleDraft.trim().slice(0, 80) },
        user.uid,
      );
      setRenaming(false);
      onNotice("Board renamed");
    } catch (error) {
      onError(error);
    }
  }

  async function toggleLock() {
    if (!isOwner) return;
    try {
      await updateBoard(boardId, { locked: !board.locked }, user.uid);
      onNotice(board.locked ? "Board unlocked" : "Board locked");
    } catch (error) {
      onError(error);
    }
  }

  async function shareBoard() {
    if (user.isAnonymous) {
      try {
        await upgradeGuestWithGoogle();
        onNotice("Signed in with Google. Select Share again to copy the link.");
      } catch (error) {
        onError(error);
      }
      return;
    }
    if (board.accessMode !== "link") {
      onError(
        new Error("Enable “Anyone with the link” in Settings before sharing."),
      );
      return;
    }
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = `#/board/${encodeURIComponent(boardId)}`;
    try {
      await copyText(url.toString());
      setShareCopied(true);
      window.clearTimeout(shareTimerRef.current);
      shareTimerRef.current = window.setTimeout(
        () => setShareCopied(false),
        3200,
      );
      onNotice("Board link copied");
    } catch {
      onError(
        new Error(
          "The link could not be copied. Allow clipboard access and try again.",
        ),
      );
    }
  }

  async function exportBoard() {
    if (!exportRef.current || !board) return;
    setExporting(true);
    setSelectedCard(null);
    setIdeasOpen(false);
    setMindActive(false);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 1.5,
        backgroundColor: "#FAFAF7",
        filter: (node) =>
          !(node instanceof HTMLElement) ||
          !node.hasAttribute("data-export-exclude"),
      });
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      const safeTitle = board.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.download = `${safeTitle || "decision-board"}-${date}.png`;
      link.href = dataUrl;
      link.click();
      onNotice("PNG exported");
    } catch {
      onError(
        new Error(
          "The PNG could not be created. Please try the export again.",
        ),
      );
    } finally {
      setExporting(false);
    }
  }

  async function acceptIdeaPlan(plan) {
    const notes = showWhiteboard ? plan?.notes || [] : [];
    const nodes = showMindMap ? plan?.nodes || [] : [];
    const edges = showMindMap ? plan?.edges || [] : [];
    const occupied = existingCanvasRectangles();
    const cardIdMap = new Map(
      notes.map((note, index) => [
        String(note.id || `note-${index + 1}`),
        makeId("card"),
      ]),
    );
    const nodeIdMap = new Map(
      nodes.map((node, index) => [
        String(node.id || `node-${index + 1}`),
        makeId("node"),
      ]),
    );
    const nodeLayouts = new Map();
    const noteLayouts = new Map();

    for (const note of notes) {
      const position = findOpenPosition(
        268,
        196,
        cardPositionCandidates(),
        occupied,
        8,
      );
      if (!position) {
        throw new Error("There is not enough open space for all Gemini notes.");
      }
      noteLayouts.set(note.id, position);
      occupied.push({ ...position, width: 268, height: 196 });
    }

    for (const node of nodes) {
      const shape = normalizeNodeShape(node.shape);
      const height = shape === "diamond" ? 104 : shape === "ellipse" ? 84 : 72;
      const linkedNoteId =
        node.noteId ||
        notes.find((note) => note.nodeId === node.id)?.id ||
        "";
      const linkedNote = noteLayouts.get(linkedNoteId);
      const nearbyCandidates = linkedNote
        ? [
            {
              x: linkedNote.x - 244,
              y: linkedNote.y + (196 - height) / 2,
            },
            {
              x: linkedNote.x + 302,
              y: linkedNote.y + (196 - height) / 2,
            },
            {
              x: linkedNote.x + 29,
              y: linkedNote.y - height - 34,
            },
            {
              x: linkedNote.x + 29,
              y: linkedNote.y + 230,
            },
          ]
        : [];
      const position = findOpenPosition(
        210,
        height,
        [...nearbyCandidates, ...nodePositionCandidates()],
        occupied,
        8,
      );
      if (!position) {
        throw new Error(
          "There is not enough open space for the Gemini mind map.",
        );
      }
      const layout = { ...position, width: 210, height, shape };
      nodeLayouts.set(node.id, layout);
      occupied.push({
        x: position.x,
        y: position.y,
        width: 210,
        height,
      });
    }

    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      await createCard(boardId, {
        id: cardIdMap.get(note.id),
        creatorId: user.uid,
        creatorName: user.displayName,
        type: "text",
        text: note.text,
        ...noteLayouts.get(note.id),
        width: 268,
        height: 196,
        colour: Object.keys(CARD_COLOURS)[(cards.length + index) % 5],
      });
    }

    const currentCount = Object.keys(mindMap.nodes || {}).length;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const layout = nodeLayouts.get(node.id);
      const linkedNoteId =
        node.noteId ||
        notes.find((note) => note.nodeId === node.id)?.id ||
        "";
      await saveMindNode(
        boardId,
        {
          id: nodeIdMap.get(node.id),
          text: node.text,
          x: layout.x,
          y: layout.y,
          w: 210,
          h: layout.height,
          colorCode:
            MIND_NODE_COLOURS[
              (currentCount + index) % MIND_NODE_COLOURS.length
            ],
          shape: layout.shape,
          fontSize: 14,
          z: 1,
          locked: false,
          ...(cardIdMap.get(linkedNoteId)
            ? { linkedCardId: cardIdMap.get(linkedNoteId) }
            : {}),
        },
        user.uid,
      );
    }
    for (const edge of edges) {
      const from = nodeIdMap.get(edge.from);
      const to = nodeIdMap.get(edge.to);
      if (!from || !to || from === to) continue;
      await saveMindEdge(
        boardId,
        {
          id: makeId("edge"),
          from,
          to,
          colorCode: "#9487B8",
          dashed: false,
          shape: normalizeEdgeShape(edge.shape),
          arrowType: normalizeArrowType(edge.arrowType || "arrow"),
        },
        user.uid,
      );
    }
  }

  async function upgradeForSharedBoard() {
    try {
      await upgradeGuestWithGoogle();
      onNotice("Signed in with Google. Opening the shared board…");
    } catch (error) {
      onError(error);
    }
  }

  if (joinState === "joining" || loading) {
    return (
      <main className="full-loader">
        <SpinnerGap className="spin" size={26} />
        Opening the board…
      </main>
    );
  }

  if (joinState === "error" || !board) {
    return (
      <main className="missing-board">
        <AppLogo />
        <h1>Board not found</h1>
        <p>
          The link may be incorrect, private, or the board was removed. If this
          is a shared board, ask its owner to enable link access.
        </p>
        {user.isAnonymous && (
          <button className="google-button" onClick={upgradeForSharedBoard}>
            <img
              src="https://img.icons8.com/color/48/google-logo.png"
              alt=""
              width="20"
              height="20"
            />
            Sign in with Google to continue
          </button>
        )}
        <button className="primary-button" onClick={goHome}>
          <ArrowLeft size={18} />
          Back to boards
        </button>
      </main>
    );
  }

  return (
    <main className="board-page">
      <header className="board-topbar">
        <div className="board-topbar-left">
          <button
            className="back-button"
            type="button"
            aria-label="Back to boards"
            onClick={goHome}
          >
            <ArrowLeft size={20} />
          </button>
          <AppLogo compact />
          <div className="board-title-area">
            {renaming ? (
              <div className="rename-control">
                <input
                  value={titleDraft}
                  maxLength={80}
                  autoFocus
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") renameBoard();
                    if (event.key === "Escape") setRenaming(false);
                  }}
                />
                <button type="button" aria-label="Save board name" onClick={renameBoard}>
                  <Check size={17} weight="bold" />
                </button>
              </div>
            ) : (
              <button
                className="board-title-button"
                type="button"
                onClick={() => isOwner && setRenaming(true)}
                title={isOwner ? "Rename board" : board.title}
              >
                <strong>{board.title}</strong>
              </button>
            )}
            <span>
              {workspaceModeLabel(workspaceMode)} ·{" "}
              {board.locked ? "Locked" : "Live"}
              {firebaseMode === "demo" ? " · saved in this browser" : ""}
            </span>
          </div>
        </div>

        <div className="board-topbar-actions">
          <span className="member-count">
            <Users size={18} />
            {board.memberCount || 1}
          </span>
          {isOwner && (
            <>
              <button
                className="secondary-button compact-button"
                type="button"
                aria-label="Open board settings"
                onClick={() => setSettingsOpen(true)}
              >
                <GearSix size={17} />
                <span>Settings</span>
              </button>
              <button
                className="secondary-button compact-button"
                type="button"
                aria-label={board.locked ? "Unlock board" : "Lock board"}
                onClick={toggleLock}
              >
                {board.locked ? <LockOpen size={17} /> : <Lock size={17} />}
                <span>{board.locked ? "Unlock" : "Lock"}</span>
              </button>
            </>
          )}
          <button
            className="secondary-button compact-button"
            type="button"
            aria-label={exporting ? "Exporting PNG" : "Export board as PNG"}
            onClick={exportBoard}
            disabled={exporting}
          >
            <Export size={17} />
            <span>{exporting ? "Exporting…" : "PNG"}</span>
          </button>
          <button
            className={`share-button ${shareCopied ? "is-copied" : ""}`}
            type="button"
            aria-label={
              user.isAnonymous
                ? "Sign in with Google to share"
                : shareCopied
                  ? "Board link copied"
                  : "Copy board share link"
            }
            onClick={shareBoard}
            disabled={board.accessMode !== "link"}
            title={
              user.isAnonymous
                ? "Sign in with Google to share this board"
                : board.accessMode === "link"
                  ? "Copy board share link"
                  : "Enable link access in Settings to share"
            }
          >
            {shareCopied ? (
              <Check size={18} weight="bold" />
            ) : (
              <ShareNetwork size={18} weight="bold" />
            )}
            <span>
              {shareCopied ? "Copied!" : user.isAnonymous ? "Sign in" : "Share"}
            </span>
          </button>
        </div>
      </header>

      {board.locked && (
        <div className="lock-banner" data-export-exclude="true">
          <Lock size={16} weight="fill" />
          This board is locked. Everyone can review the outcome, but only the
          owner can unlock editing.
        </div>
      )}

      <div className="board-workspace">
        <nav className="tool-rail" aria-label="Board tools">
          {showWhiteboard && (
            <>
              <ToolButton
                label="Text"
                icon={<Note size={21} weight="duotone" />}
                disabled={!canAdd}
                onClick={() => addTextCard()}
              />
              <ToolButton
                label="Link"
                icon={<LinkSimple size={21} weight="duotone" />}
                disabled={!canAdd}
                onClick={() => setLinkModalOpen(true)}
              />
            </>
          )}
          {showWhiteboard && showMindMap && <span className="tool-divider" />}
          {showMindMap && (
            <ToolButton
              label="Mind map"
              icon={<Brain size={21} weight="duotone" />}
              active={mindActive}
              disabled={!canAdd}
              onClick={() => {
                setMindActive((value) => !value);
                setSelectedCard(null);
                setIdeasOpen(false);
              }}
            />
          )}
          <span className="tool-divider" />
          <ToolButton
            label="Gemini"
            icon={
              <img
                className="gemini-tool-logo"
                src="https://img.icons8.com/color/48/gemini-ai.png"
                alt=""
                width="22"
                height="22"
              />
            }
            active={ideasOpen}
            disabled={!canAdd || user.isAnonymous}
            onClick={() => {
              setIdeasOpen((value) => !value);
              setSelectedCard(null);
              setMindActive(false);
            }}
          />
        </nav>

        <section
          ref={canvasViewportRef}
          className={`canvas-viewport ${
            selectedCard || ideasOpen ? "with-inspector" : ""
          }`}
          aria-label="Decision Board canvas"
          onPointerDown={beginCanvasPan}
        >
          <div
            className="board-canvas"
            ref={exportRef}
            style={{
              width: board.canvasWidth || 1600,
              height: board.canvasHeight || 980,
            }}
          >
            <div className="canvas-heading" data-export-exclude="true">
              <span className="eyebrow">
                {workspaceModeLabel(workspaceMode)} workspace
              </span>
              <strong>{board.title}</strong>
              <small>
                {workspaceMode === "both"
                  ? "Cards and mind maps share this canvas."
                  : "Drag ideas to organise the discussion."}
              </small>
            </div>

            {!visibleContentReady && (
              <div className="canvas-empty" data-export-exclude="true">
                <SpinnerGap className="spin" size={24} />
                <strong>Loading board content…</strong>
              </div>
            )}

            {contentError && visibleContentReady && (
              <div className="canvas-empty" data-export-exclude="true">
                <X size={26} />
                <strong>Some board content could not load</strong>
                <span>{contentError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setContentError("");
                    setSubscriptionVersion((value) => value + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {!contentError &&
              visibleContentReady &&
              visibleWorkspaceEmpty && (
              <div className="canvas-empty" data-export-exclude="true">
                <LightbulbFilament size={30} weight="duotone" />
                <strong>Start with one useful idea</strong>
                <span>
                  {workspaceMode === "mindmap"
                    ? "Add a node, then connect related ideas."
                    : workspaceMode === "whiteboard"
                      ? "Add a text card or link."
                      : "Add a card or mind-map node to the shared canvas."}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    showWhiteboard ? addTextCard() : setMindActive(true)
                  }
                >
                  <Plus size={17} weight="bold" />
                  {showWhiteboard ? "Add first card" : "Open mind-map tools"}
                </button>
              </div>
            )}

            {showWhiteboard && (
              <CardEdgeLayer
                cards={cards}
                edges={cardEdges}
                user={user}
                locked={board.locked}
                isOwner={isOwner}
                collaborationMode={board.collaborationMode}
                active={cardEdgeActive}
                onActivate={() => {
                  setCardEdgeActive(true);
                  setSelectedCard(null);
                  setMindActive(false);
                  setIdeasOpen(false);
                }}
                onClose={() => setCardEdgeActive(false)}
                onUpdate={updateCardConnection}
                onDelete={removeCardConnection}
                onNotice={onNotice}
                onError={onError}
              />
            )}

            {showWhiteboard && cards.map((card) => (
              <BoardCard
                key={card.id}
                card={card}
                selected={selectedCard?.id === card.id}
                canMove={
                  !board.locked &&
                  (isOwner ||
                    board.collaborationMode === "shared-edit" ||
                    card.creatorId === user.uid)
                }
                moveDisabledReason={
                  board.locked
                    ? "Board is locked"
                    : "Only the creator or owner can move this card"
                }
                onSelect={(nextCard) => {
                  setSelectedCard(nextCard);
                  setCardEdgeActive(false);
                  setIdeasOpen(false);
                  setMindActive(false);
                }}
                onMove={moveCard}
                onColourChange={recolourCard}
                onDelete={removeCardFromMenu}
                connectFrom={cardConnectFrom}
                onConnectFrom={toggleCardConnection}
                onConnectTo={createCardConnection}
              />
            ))}

            {showMindMap && (
              <MindMapLayer
                boardId={boardId}
                user={user}
                map={mindMap}
                active={mindActive}
                locked={board.locked}
                isOwner={isOwner}
                collaborationMode={board.collaborationMode}
                onClose={() => setMindActive(false)}
                onActivate={() => {
                  setMindActive(true);
                  setCardEdgeActive(false);
                  setSelectedCard(null);
                  setIdeasOpen(false);
                }}
                onNotice={onNotice}
                onError={onError}
                onLinkedCardSelect={openLinkedCard}
              />
            )}

            {selectedCard && !ideasOpen && (
              <div
                className="mind-tools note-selection-tools"
                data-export-exclude="true"
                aria-label={`Selected ${selectedCard.type === "text" ? "note" : "link card"} actions`}
              >
                {noteToolbarConfirmDelete ? (
                  <>
                    <strong className="mind-tools-confirm-copy">
                      Delete this {selectedCard.type === "text" ? "note" : "link card"} and its activity?
                    </strong>
                    <button
                      type="button"
                      onClick={() => setNoteToolbarConfirmDelete(false)}
                      disabled={noteToolbarBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={removeSelectedCardFromToolbar}
                      disabled={noteToolbarBusy}
                    >
                      <Trash size={17} />
                      {noteToolbarBusy ? "Deleting…" : "Delete"}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="mind-tools-label">
                      {selectedCard.type === "text" ? "Note" : "Link card"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .querySelector(".inspector-panel textarea")
                          ?.focus()
                      }
                    >
                      Edit
                    </button>
                    {selectedCard.type === "text" && (
                      <button
                        type="button"
                        onClick={() => toggleCardConnection(selectedCard.id)}
                        disabled={board.locked}
                      >
                        <LinkSimple size={17} weight="bold" />
                        Connect
                      </button>
                    )}
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => setNoteToolbarConfirmDelete(true)}
                      disabled={
                        board.locked ||
                        !(
                          isOwner ||
                          board.collaborationMode === "shared-edit" ||
                          selectedCard.creatorId === user.uid
                        )
                      }
                    >
                      <Trash size={17} />
                      Delete {selectedCard.type === "text" ? "note" : "card"}
                    </button>
                    <button
                      type="button"
                      className="mind-done"
                      onClick={() => setSelectedCard(null)}
                    >
                      <Check size={17} weight="bold" />
                      Done
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {selectedCard && (
          <CardInspector
            board={board}
            card={selectedCard}
            user={user}
            onClose={() => setSelectedCard(null)}
            onDeleted={() => setSelectedCard(null)}
            onNotice={onNotice}
            onError={onError}
          />
        )}

        {ideasOpen && (
          <IdeasPanel
            boardId={boardId}
            workspaceMode={workspaceMode}
            onClose={() => setIdeasOpen(false)}
            onAccept={acceptIdeaPlan}
            onNotice={onNotice}
            onError={onError}
          />
        )}
      </div>

      {linkModalOpen && (
        <LinkCardModal
          onClose={() => setLinkModalOpen(false)}
          onCreate={addLinkCard}
        />
      )}

      {settingsOpen && isOwner && (
        <BoardSettingsModal
          board={board}
          onClose={() => setSettingsOpen(false)}
          onSave={saveBoardSettings}
          onDelete={removeBoard}
        />
      )}
    </main>
  );
}

export function App() {
  const [user, setUser] = useState(undefined);
  const [boardId, setBoardId] = useState(currentBoardId());
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const noticeTimerRef = useRef(null);
  const errorTimerRef = useRef(null);

  const showNotice = useCallback((message) => {
    window.clearTimeout(noticeTimerRef.current);
    setToast(message);
    noticeTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const showError = useCallback((nextError) => {
    window.clearTimeout(errorTimerRef.current);
    setError(nextError?.message || "Something went wrong.");
    errorTimerRef.current = window.setTimeout(() => setError(""), 5200);
  }, []);

  useEffect(() => {
    if (firebaseConfigError) {
      setUser(null);
      return undefined;
    }
    return watchAuth(setUser, showError);
  }, [showError]);

  useEffect(
    () => () => {
      window.clearTimeout(noticeTimerRef.current);
      window.clearTimeout(errorTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handleRoute = () => setBoardId(currentBoardId());
    window.addEventListener("hashchange", handleRoute);
    if (!window.location.hash) goHome();
    return () => window.removeEventListener("hashchange", handleRoute);
  }, []);

  if (firebaseConfigError) {
    return (
      <main className="missing-board">
        <AppLogo />
        <h1>Firebase setup is incomplete</h1>
        <p>{firebaseConfigError}</p>
        <p>
          Copy <strong>.env.example</strong> to <strong>.env.local</strong>,
          add the Firebase Web values, and restart the development server.
        </p>
      </main>
    );
  }

  if (user === undefined) {
    return (
      <main className="full-loader">
        <SpinnerGap className="spin" size={26} />
        Preparing Decision Board…
      </main>
    );
  }

  return (
    <>
      {!user ? (
        <AuthScreen boardId={boardId} onAuthenticated={setUser} />
      ) : boardId ? (
        <BoardView
          boardId={boardId}
          user={user}
          onError={showError}
          onNotice={showNotice}
        />
      ) : (
        <Dashboard user={user} onError={showError} onNotice={showNotice} />
      )}

      {toast && (
        <div className="toast success-toast" role="status">
          <Check size={17} weight="bold" />
          {toast}
        </div>
      )}
      {error && (
        <div className="toast error-toast" role="alert">
          <X size={17} weight="bold" />
          {error}
        </div>
      )}
    </>
  );
}
