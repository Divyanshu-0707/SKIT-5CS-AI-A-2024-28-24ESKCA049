import { useEffect, useRef, useState } from "react";
import {
  ArrowSquareOut,
  DotsSix,
  LinkSimple,
  Note,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { CARD_COLOURS } from "../lib/demoData.js";
import { ContextMenu } from "./ContextMenu.jsx";

function CardTypeIcon({ type }) {
  if (type === "link") return <LinkSimple size={16} />;
  return <Note size={16} />;
}

export function BoardCard({
  card,
  selected,
  canMove,
  moveDisabledReason,
  onSelect,
  onMove,
  onColourChange,
  onDelete,
  connectFrom,
  onConnectFrom,
  onConnectTo,
}) {
  const [position, setPosition] = useState({ x: card.x, y: card.y });
  const [dragging, setDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setPosition({ x: card.x, y: card.y });
  }, [card.x, card.y]);

  function boundedPosition(x, y) {
    const width = card.width || 246;
    const height = card.height || 166;
    return {
      x: Math.min(1600 - width, Math.max(24, x)),
      y: Math.min(980 - height, Math.max(74, y)),
    };
  }

  function beginDrag(event) {
    if (
      !canMove ||
      event.button !== 0 ||
      event.target.closest("a, button, input, textarea, select")
    ) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.x,
      y: position.y,
    };
    const target = event.currentTarget;
    let moved = false;

    function move(moveEvent) {
      const distance = Math.hypot(
        moveEvent.clientX - start.pointerX,
        moveEvent.clientY - start.pointerY,
      );
      if (!moved && distance < 5) return;
      moved = true;
      setDragging(true);
      setPosition(
        boundedPosition(
          start.x + moveEvent.clientX - start.pointerX,
          start.y + moveEvent.clientY - start.pointerY,
        ),
      );
    }

    function cleanUp() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      setDragging(false);
    }

    function cancel() {
      cleanUp();
      setPosition({ x: card.x, y: card.y });
    }

    async function finish(upEvent) {
      cleanUp();
      if (!moved) return;
      suppressClickRef.current = true;
      const next = boundedPosition(
        start.x + upEvent.clientX - start.pointerX,
        start.y + upEvent.clientY - start.pointerY,
      );
      setPosition(next);
      try {
        await onMove(card.id, next);
      } catch {
        setPosition({ x: card.x, y: card.y });
      }
    }

    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish, { once: true });
    target.addEventListener("pointercancel", cancel, { once: true });
  }

  function openContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(false);
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  async function chooseColour(colour) {
    if (!canMove || menuBusy) return;
    setMenuBusy(true);
    try {
      await onColourChange(card.id, colour);
      setContextMenu(null);
    } finally {
      setMenuBusy(false);
    }
  }

  async function confirmCardDelete() {
    if (!canMove || menuBusy) return;
    setMenuBusy(true);
    try {
      await onDelete(card.id);
      setContextMenu(null);
    } finally {
      setMenuBusy(false);
    }
  }

  return (
    <>
      <article
        data-card-id={card.id}
        className={`board-card ${selected ? "is-selected" : ""} ${
          dragging ? "is-dragging" : ""
        } ${connectFrom === card.id ? "is-connect-start" : ""}`}
        style={{
          left: position.x,
          top: position.y,
          width: card.width || 246,
          minHeight: card.height || 166,
          background: CARD_COLOURS[card.colour] || CARD_COLOURS.yellow,
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (connectFrom && connectFrom !== card.id && card.type === "text") {
            onConnectTo(card.id);
            return;
          }
          onSelect(card);
        }}
        onContextMenu={openContextMenu}
        onPointerDown={beginDrag}
        role="button"
        aria-label={`Open ${card.type} card: ${card.text || "Untitled idea"}`}
        title={
          canMove ? "Drag to move · right-click for actions" : moveDisabledReason
        }
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(card);
          }
        }}
      >
        <header className="card-drag-handle" aria-hidden="true">
          <span className="card-type">
            <CardTypeIcon type={card.type} />
            {card.type}
          </span>
          <DotsSix size={19} weight="bold" aria-hidden="true" />
        </header>

        <p className="card-text">{card.text || "Untitled idea"}</p>

        {card.type === "link" && card.url && (
          <a
            className="card-link"
            href={card.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Open link <ArrowSquareOut size={14} />
          </a>
        )}

        <footer>
          <span className="card-author">{card.creatorName || "Collaborator"}</span>
        </footer>
      </article>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Card actions"
          onClose={() => setContextMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelect(card);
              setContextMenu(null);
            }}
          >
            <PencilSimple size={17} />
            Open details
          </button>
          <div className="context-menu-section">
            <span>Card colour</span>
            <div className="context-colour-grid">
              {Object.entries(CARD_COLOURS).map(([name, colour]) => (
                <button
                  key={name}
                  type="button"
                  className={card.colour === name ? "is-selected" : ""}
                  style={{ "--swatch-colour": colour }}
                  aria-label={`Use ${name} card colour`}
                  title={name}
                  disabled={!canMove || menuBusy}
                  onClick={() => chooseColour(name)}
                />
              ))}
            </div>
          </div>
          {card.type === "text" && canMove && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onConnectFrom(card.id);
                setContextMenu(null);
              }}
            >
              <LinkSimple size={17} />
              {connectFrom === card.id
                ? "Cancel note connection"
                : "Connect from this note"}
            </button>
          )}
          {!canMove && (
            <p className="context-menu-note">{moveDisabledReason}</p>
          )}
          {canMove && !confirmDelete && (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash size={17} />
              Delete card
            </button>
          )}
          {canMove && confirmDelete && (
            <div className="context-confirm">
              <strong>Delete this card?</strong>
              <div>
                <button
                  type="button"
                  disabled={menuBusy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={menuBusy}
                  onClick={confirmCardDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </ContextMenu>
      )}
    </>
  );
}
