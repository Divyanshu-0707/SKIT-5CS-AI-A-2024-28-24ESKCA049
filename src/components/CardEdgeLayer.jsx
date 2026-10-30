import { useEffect, useState } from "react";
import { Check, Trash } from "@phosphor-icons/react";
import { ContextMenu } from "./ContextMenu.jsx";
import {
  makeEdgePath,
  normalizeArrowType,
  normalizeEdgeShape,
} from "../lib/mindMapGeometry.js";

const EDGE_SHAPES = [
  { value: "straight", label: "Straight" },
  { value: "elbow", label: "Elbow" },
];

const ARROW_TYPES = [
  { value: "none", label: "Line" },
  { value: "arrow", label: "Arrow →" },
  { value: "double", label: "Double ↔" },
];

function cardAsNode(card) {
  return {
    x: card.x,
    y: card.y,
    w: card.width || 246,
    h: card.height || 176,
    shape: "rounded",
  };
}

function markerId(edgeId, end) {
  return `card-edge-${String(edgeId).replace(/[^a-zA-Z0-9_-]/g, "")}-${end}`;
}

export function CardEdgeLayer({
  cards,
  edges,
  user,
  locked,
  isOwner,
  collaborationMode,
  active,
  onActivate,
  onClose,
  onUpdate,
  onDelete,
  onNotice,
  onError,
}) {
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const edgeList = Object.values(edges || {});
  const sharedEditing = collaborationMode === "shared-edit";
  const selected = selectedEdge ? edges?.[selectedEdge] : null;
  const canEdit = (edge) =>
    !locked &&
    (isOwner || sharedEditing || edge?.createdBy === user.uid);

  useEffect(() => {
    if (active) return;
    setSelectedEdge(null);
    setContextMenu(null);
    setConfirmDelete(false);
  }, [active]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedEdge]);

  function openMenu(event, edge) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedEdge(edge.id);
    setConfirmDelete(false);
    setContextMenu({ x: event.clientX, y: event.clientY });
    onActivate?.();
  }

  async function updateEdge(patch, message) {
    if (!selected || !canEdit(selected) || busy) return;
    setBusy(true);
    try {
      await onUpdate(selected, patch);
      setContextMenu(null);
      onNotice(message);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEdge() {
    if (!selected || !canEdit(selected) || busy) return;
    setBusy(true);
    try {
      await onDelete(selected.id);
      setContextMenu(null);
      setSelectedEdge(null);
      onNotice("Note connection deleted");
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <svg
        className="card-edge-layer"
        viewBox="0 0 1600 980"
        preserveAspectRatio="none"
        aria-label="Sticky note connections"
      >
        <defs>
          {edgeList.map((edge) => (
            <g key={`markers-${edge.id}`}>
              <marker
                id={markerId(edge.id, "start")}
                viewBox="0 0 14 14"
                refX="14"
                refY="7"
                markerWidth="18"
                markerHeight="18"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 14 7 L 0 14 z"
                  fill={edge.colorCode || "#7E749B"}
                />
              </marker>
              <marker
                id={markerId(edge.id, "end")}
                viewBox="0 0 14 14"
                refX="14"
                refY="7"
                markerWidth="18"
                markerHeight="18"
                markerUnits="userSpaceOnUse"
                orient="auto"
              >
                <path
                  d="M 0 0 L 14 7 L 0 14 z"
                  fill={edge.colorCode || "#7E749B"}
                />
              </marker>
            </g>
          ))}
        </defs>
        {edgeList.map((edge) => {
          const fromCard = cardsById.get(edge.from);
          const toCard = cardsById.get(edge.to);
          if (!fromCard || !toCard) return null;
          const arrowType = normalizeArrowType(edge.arrowType);
          return (
            <path
              key={edge.id}
              d={makeEdgePath(
                cardAsNode(fromCard),
                cardAsNode(toCard),
                edge.shape,
              )}
              stroke={edge.colorCode || "#7E749B"}
              strokeWidth={selectedEdge === edge.id ? 5 : 3}
              strokeDasharray={edge.dashed ? "8 7" : undefined}
              markerStart={
                arrowType === "double"
                  ? `url(#${markerId(edge.id, "start")})`
                  : undefined
              }
              markerEnd={
                arrowType === "arrow" || arrowType === "double"
                  ? `url(#${markerId(edge.id, "end")})`
                  : undefined
              }
              fill="none"
              className="card-edge"
              role="button"
              tabIndex={0}
              aria-label={`Note connection from ${fromCard.text || "note"} to ${
                toCard.text || "note"
              }`}
              onPointerDown={(event) => {
                event.stopPropagation();
                setSelectedEdge(edge.id);
                onActivate?.();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedEdge(edge.id);
                  onActivate?.();
                }
              }}
              onContextMenu={(event) => openMenu(event, edge)}
            />
          );
        })}
      </svg>

      {active && selected && (
        <div
          className="mind-tools is-edge-tools"
          data-export-exclude="true"
          aria-label="Selected note connection actions"
        >
          {confirmDelete ? (
            <>
              <strong className="mind-tools-confirm-copy">
                Delete this note connection?
              </strong>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={busy}
                onClick={deleteEdge}
              >
                <Trash size={17} />
                {busy ? "Deleting…" : "Delete"}
              </button>
            </>
          ) : (
            <>
              <span className="mind-tools-label">Note connection</span>
              {EDGE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeEdgeShape(selected.shape) === shape.value
                      ? "is-active"
                      : ""
                  }
                  disabled={!canEdit(selected) || busy}
                  onClick={() =>
                    updateEdge(
                      { shape: shape.value },
                      `${shape.label} note connection applied`,
                    )
                  }
                >
                  {shape.label}
                </button>
              ))}
              <span className="mind-tools-divider" aria-hidden="true" />
              {ARROW_TYPES.map((arrow) => (
                <button
                  key={arrow.value}
                  type="button"
                  className={
                    normalizeArrowType(selected.arrowType) === arrow.value
                      ? "is-active"
                      : ""
                  }
                  disabled={!canEdit(selected) || busy}
                  onClick={() =>
                    updateEdge(
                      { arrowType: arrow.value },
                      `${arrow.label} endpoint style applied`,
                    )
                  }
                >
                  {arrow.label}
                </button>
              ))}
              <button
                type="button"
                className="is-danger"
                disabled={!canEdit(selected)}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash size={17} />
                Delete connection
              </button>
              <button type="button" className="mind-done" onClick={onClose}>
                <Check size={17} weight="bold" />
                Done
              </button>
            </>
          )}
        </div>
      )}

      {contextMenu && selected && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Sticky note connection actions"
          onClose={() => setContextMenu(null)}
        >
          <div className="context-menu-section">
            <span>Path shape</span>
            <div className="context-choice-grid is-two-column">
              {EDGE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeEdgeShape(selected.shape) === shape.value
                      ? "is-selected"
                      : ""
                  }
                  disabled={!canEdit(selected) || busy}
                  onClick={() =>
                    updateEdge(
                      { shape: shape.value },
                      `${shape.label} note connection applied`,
                    )
                  }
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
          <div className="context-menu-section">
            <span>Endpoints</span>
            <div className="context-choice-grid is-three-column">
              {ARROW_TYPES.map((arrow) => (
                <button
                  key={arrow.value}
                  type="button"
                  className={
                    normalizeArrowType(selected.arrowType) === arrow.value
                      ? "is-selected"
                      : ""
                  }
                  disabled={!canEdit(selected) || busy}
                  onClick={() =>
                    updateEdge(
                      { arrowType: arrow.value },
                      `${arrow.label} endpoint style applied`,
                    )
                  }
                >
                  {arrow.label}
                </button>
              ))}
            </div>
          </div>
          {!canEdit(selected) && (
            <p className="context-menu-note">
              Only the creator or board owner can edit this connection.
            </p>
          )}
          {canEdit(selected) && !confirmDelete && (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash size={17} />
              Delete connection
            </button>
          )}
          {canEdit(selected) && confirmDelete && (
            <div className="context-confirm">
              <strong>Delete this note connection?</strong>
              <div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="is-danger"
                  disabled={busy}
                  onClick={deleteEdge}
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
