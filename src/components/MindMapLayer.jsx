import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowBendDownRight,
  Check,
  LinkSimple,
  Note,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  deleteMindEdge,
  deleteMindNode,
  saveMindEdge,
  saveMindNode,
} from "../lib/services.js";
import { makeId } from "../lib/demoData.js";
import {
  makeEdgePath,
  normalizeArrowType,
  normalizeEdgeShape,
  normalizeNodeShape,
} from "../lib/mindMapGeometry.js";
import { ContextMenu } from "./ContextMenu.jsx";

const NODE_COLOURS = ["#E9E1FF", "#FFF4B8", "#DDF7E8", "#DDEEFF", "#FFE0D6"];
const NODE_SHAPES = [
  { value: "rect", label: "Rectangle" },
  { value: "rounded", label: "Rounded" },
  { value: "pill", label: "Pill" },
  { value: "ellipse", label: "Ellipse" },
  { value: "diamond", label: "Diamond" },
];
const EDGE_SHAPES = [
  { value: "straight", label: "Straight" },
  { value: "elbow", label: "Elbow" },
];
const ARROW_TYPES = [
  { value: "none", label: "Line" },
  { value: "arrow", label: "Arrow →" },
  { value: "double", label: "Double ↔" },
];

function markerId(edgeId, end) {
  return `mind-edge-${String(edgeId).replace(/[^a-zA-Z0-9_-]/g, "")}-${end}`;
}

export function MindMapLayer({
  boardId,
  user,
  map,
  active,
  locked,
  isOwner,
  collaborationMode,
  onClose,
  onActivate,
  onNotice,
  onError,
  onLinkedCardSelect,
}) {
  const [localNodes, setLocalNodes] = useState(map.nodes || {});
  const [localEdges, setLocalEdges] = useState(map.edges || {});
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [connectFrom, setConnectFrom] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toolbarConfirmDelete, setToolbarConfirmDelete] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [menuBusy, setMenuBusy] = useState(false);
  const suppressNodeClickRef = useRef(false);

  useEffect(() => {
    setLocalNodes(map.nodes || {});
  }, [map.nodes]);

  useEffect(() => {
    setLocalEdges(map.edges || {});
  }, [map.edges]);

  useEffect(() => {
    if (active) return;
    setSelectedNode(null);
    setSelectedEdge(null);
    setConnectFrom(null);
    setEditingNode(null);
    setContextMenu(null);
    setToolbarConfirmDelete(false);
  }, [active]);

  useEffect(() => {
    setToolbarConfirmDelete(false);
  }, [selectedNode, selectedEdge]);

  const edges = useMemo(() => Object.values(localEdges), [localEdges]);
  const sharedEditing = collaborationMode === "shared-edit";
  const canEditNode = (node) =>
    !locked &&
    (isOwner || sharedEditing || node?.createdBy === user.uid);
  const canEditEdge = (edge) =>
    !locked &&
    (isOwner || sharedEditing || edge?.createdBy === user.uid);
  const selectedNodeRecord = selectedNode ? localNodes[selectedNode] : null;
  const selectedEdgeRecord = selectedEdge
    ? edges.find((edge) => edge.id === selectedEdge)
    : null;
  const canDeleteSelection = selectedNodeRecord
    ? canEditNode(selectedNodeRecord)
    : selectedEdgeRecord
      ? canEditEdge(selectedEdgeRecord)
      : false;

  function boundedNodePosition(node, x, y) {
    return {
      x: Math.min(1600 - node.w - 28, Math.max(28, x)),
      y: Math.min(980 - node.h - 28, Math.max(72, y)),
    };
  }

  function nextNodePosition() {
    const xPositions = [170, 455, 740, 1025, 1310];
    const yPositions = [180, 310, 440, 570, 700, 830];
    const existing = Object.values(localNodes);
    return yPositions
      .flatMap((y) => xPositions.map((x) => ({ x, y })))
      .find(
        (candidate) =>
          !existing.some(
            (node) =>
              Math.abs(node.x - candidate.x) < 80 &&
              Math.abs(node.y - candidate.y) < 70,
          ),
      );
  }

  async function addNode() {
    if (locked) return onError(new Error("The board is locked."));
    const position = nextNodePosition();
    if (!position) {
      return onError(
        new Error("This mind map is full. Move or delete a node first."),
      );
    }
    const nodeCount = Object.keys(localNodes).length;
    const node = {
      id: makeId("node"),
      text: "New idea",
      ...position,
      w: 210,
      h: 72,
      colorCode: NODE_COLOURS[nodeCount % NODE_COLOURS.length],
      shape: "rounded",
      fontSize: 14,
      z: 1,
      locked: false,
    };
    try {
      await saveMindNode(boardId, node, user.uid);
      setSelectedNode(node.id);
      setEditingNode(node.id);
      onNotice("Mind-map node added");
    } catch (error) {
      onError(error);
    }
  }

  async function createConnection(toId) {
    if (!connectFrom || connectFrom === toId) {
      setConnectFrom(toId);
      onNotice("Choose a second node to connect");
      return;
    }
    const duplicate = edges.some(
      (edge) =>
        (edge.from === connectFrom && edge.to === toId) ||
        (edge.from === toId && edge.to === connectFrom),
    );
    if (duplicate) {
      setConnectFrom(null);
      return onNotice("Those ideas are already connected");
    }

    try {
      await saveMindEdge(
        boardId,
        {
          id: makeId("edge"),
          from: connectFrom,
          to: toId,
          colorCode: "#9487B8",
          dashed: false,
          shape: "elbow",
          arrowType: "arrow",
        },
        user.uid,
      );
      setConnectFrom(null);
      onNotice("Ideas connected");
    } catch (error) {
      onError(error);
    }
  }

  async function removeSelection() {
    if (locked) return onError(new Error("The board is locked."));
    if (!canDeleteSelection) {
      return onError(new Error("You can delete only the items you may edit."));
    }
    setSelectionBusy(true);
    try {
      if (selectedNode) {
        await deleteMindNode(boardId, selectedNode, user.uid);
        setSelectedNode(null);
        setEditingNode(null);
        onNotice("Node removed");
      } else if (selectedEdge) {
        await deleteMindEdge(boardId, selectedEdge);
        setSelectedEdge(null);
        onNotice("Connection removed");
      }
    } catch (error) {
      onError(error);
    } finally {
      setToolbarConfirmDelete(false);
      setSelectionBusy(false);
    }
  }

  function startNodeDrag(event, node) {
    if (
      !canEditNode(node) ||
      editingNode === node.id ||
      event.button !== 0 ||
      event.target.closest("button, input, textarea, select, a")
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: node.x,
      y: node.y,
    };
    let moved = false;

    function move(moveEvent) {
      const distance = Math.hypot(
        moveEvent.clientX - start.pointerX,
        moveEvent.clientY - start.pointerY,
      );
      if (!moved && distance < 5) return;
      moved = true;
      const position = boundedNodePosition(
        node,
        start.x + moveEvent.clientX - start.pointerX,
        start.y + moveEvent.clientY - start.pointerY,
      );
      const nextNode = {
        ...node,
        ...position,
      };
      setLocalNodes((current) => ({ ...current, [node.id]: nextNode }));
    }

    function cleanUp() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
    }

    function cancel() {
      cleanUp();
      setLocalNodes((current) => ({ ...current, [node.id]: node }));
    }

    async function finish(upEvent) {
      cleanUp();
      if (!moved) return;
      suppressNodeClickRef.current = true;
      window.setTimeout(() => {
        suppressNodeClickRef.current = false;
      }, 250);
      const position = boundedNodePosition(
        node,
        start.x + upEvent.clientX - start.pointerX,
        start.y + upEvent.clientY - start.pointerY,
      );
      const nextNode = {
        ...node,
        ...position,
      };
      setLocalNodes((current) => ({ ...current, [node.id]: nextNode }));
      try {
        await saveMindNode(boardId, nextNode, user.uid);
      } catch (error) {
        setLocalNodes((current) => ({ ...current, [node.id]: node }));
        onError(error);
      }
    }

    const target = event.currentTarget;
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", finish, { once: true });
    target.addEventListener("pointercancel", cancel, { once: true });
  }

  async function finishEditing(node, text) {
    if (!canEditNode(node)) return;
    setEditingNode(null);
    const nextNode = {
      ...node,
      text: text.trim().slice(0, 90) || "Untitled idea",
    };
    setLocalNodes((current) => ({ ...current, [node.id]: nextNode }));
    try {
      await saveMindNode(boardId, nextNode, user.uid);
    } catch (error) {
      setLocalNodes((current) => ({ ...current, [node.id]: node }));
      onError(error);
    }
  }

  function openNodeMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNode(node.id);
    setSelectedEdge(null);
    setConfirmDelete(false);
    setContextMenu({
      type: "node",
      id: node.id,
      x: event.clientX,
      y: event.clientY,
    });
    onActivate?.();
  }

  function openEdgeMenu(event, edge) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedEdge(edge.id);
    setSelectedNode(null);
    setConfirmDelete(false);
    setContextMenu({
      type: "edge",
      id: edge.id,
      x: event.clientX,
      y: event.clientY,
    });
    onActivate?.();
  }

  async function changeNodeShape(node, shape) {
    if (!canEditNode(node) || menuBusy) return;
    const normalizedShape = normalizeNodeShape(shape);
    const height =
      normalizedShape === "diamond"
        ? 104
        : normalizedShape === "ellipse"
          ? 84
          : 72;
    const resizedNode = {
      ...node,
      shape: normalizedShape,
      h: height,
    };
    const nextNode = {
      ...resizedNode,
      ...boundedNodePosition(resizedNode, resizedNode.x, resizedNode.y),
    };
    setMenuBusy(true);
    setLocalNodes((current) => ({ ...current, [node.id]: nextNode }));
    try {
      await saveMindNode(boardId, nextNode, user.uid);
      setContextMenu(null);
      onNotice(`${NODE_SHAPES.find((item) => item.value === normalizedShape)?.label} node shape applied`);
    } catch (error) {
      setLocalNodes((current) => ({ ...current, [node.id]: node }));
      onError(error);
    } finally {
      setMenuBusy(false);
    }
  }

  async function changeEdgeShape(edge, shape) {
    if (!canEditEdge(edge) || menuBusy) return;
    const nextEdge = { ...edge, shape: normalizeEdgeShape(shape) };
    setMenuBusy(true);
    setLocalEdges((current) => ({ ...current, [edge.id]: nextEdge }));
    try {
      await saveMindEdge(boardId, nextEdge, user.uid);
      setContextMenu(null);
      onNotice(
        `${EDGE_SHAPES.find((item) => item.value === nextEdge.shape)?.label} connection applied`,
      );
    } catch (error) {
      setLocalEdges((current) => ({ ...current, [edge.id]: edge }));
      onError(error);
    } finally {
      setMenuBusy(false);
    }
  }

  async function changeEdgeArrow(edge, arrowType) {
    if (!canEditEdge(edge) || menuBusy) return;
    const nextEdge = { ...edge, arrowType: normalizeArrowType(arrowType) };
    setMenuBusy(true);
    setLocalEdges((current) => ({ ...current, [edge.id]: nextEdge }));
    try {
      await saveMindEdge(boardId, nextEdge, user.uid);
      setContextMenu(null);
      onNotice(
        `${ARROW_TYPES.find((item) => item.value === nextEdge.arrowType)?.label} endpoint style applied`,
      );
    } catch (error) {
      setLocalEdges((current) => ({ ...current, [edge.id]: edge }));
      onError(error);
    } finally {
      setMenuBusy(false);
    }
  }

  async function deleteContextItem() {
    if (!contextMenu || menuBusy) return;
    const node = contextMenu.type === "node" ? localNodes[contextMenu.id] : null;
    const edge =
      contextMenu.type === "edge"
        ? localEdges[contextMenu.id]
        : null;
    if ((node && !canEditNode(node)) || (edge && !canEditEdge(edge))) {
      return onError(new Error("You can delete only the items you may edit."));
    }

    setMenuBusy(true);
    try {
      if (node) {
        await deleteMindNode(boardId, node.id, user.uid);
        setSelectedNode(null);
        setEditingNode(null);
        onNotice("Node removed");
      } else if (edge) {
        await deleteMindEdge(boardId, edge.id);
        setSelectedEdge(null);
        onNotice("Connection removed");
      }
      setContextMenu(null);
    } catch (error) {
      onError(error);
    } finally {
      setMenuBusy(false);
    }
  }

  return (
    <div className={`mind-map-layer ${active ? "is-active" : ""}`}>
      <svg
        className="mind-edge-layer"
        viewBox="0 0 1600 980"
        preserveAspectRatio="none"
        aria-label="Mind map connections"
      >
        <defs>
          {edges.map((edge) => (
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
                  fill={edge.colorCode || "#9487B8"}
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
                  fill={edge.colorCode || "#9487B8"}
                />
              </marker>
            </g>
          ))}
        </defs>
        {edges.map((edge) => {
          const fromNode = localNodes[edge.from];
          const toNode = localNodes[edge.to];
          if (!fromNode || !toNode) return null;
          const arrowType = normalizeArrowType(edge.arrowType);
          return (
            <path
              key={edge.id}
              d={makeEdgePath(fromNode, toNode, edge.shape)}
              stroke={edge.colorCode || "#9487B8"}
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
              className="mind-edge"
              onContextMenu={(event) => openEdgeMenu(event, edge)}
              onPointerDown={(event) => {
                event.stopPropagation();
                setSelectedEdge(edge.id);
                setSelectedNode(null);
                onActivate?.();
              }}
            />
          );
        })}
      </svg>

      {Object.values(localNodes).map((node) => {
        const isSelected = selectedNode === node.id;
        const isConnectStart = connectFrom === node.id;
        const nodeShape = normalizeNodeShape(node.shape);
        return (
          <article
            key={node.id}
            className={`mind-node shape-${nodeShape} ${isSelected ? "is-selected" : ""} ${
              isConnectStart ? "is-connect-start" : ""
            }`}
            style={{
              left: node.x,
              top: node.y,
              width: node.w,
              minHeight: node.h,
              background: node.colorCode,
              zIndex: node.z || 1,
            }}
            tabIndex={0}
            onPointerDown={(event) => {
              event.stopPropagation();
              setSelectedNode(node.id);
              setSelectedEdge(null);
              onActivate?.();
              if (event.button === 0 && connectFrom) createConnection(node.id);
              else startNodeDrag(event, node);
            }}
            onContextMenu={(event) => openNodeMenu(event, node)}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressNodeClickRef.current) {
                suppressNodeClickRef.current = false;
              }
            }}
            aria-label={`Mind-map node: ${node.text}`}
            onDoubleClick={() => {
              if (canEditNode(node)) setEditingNode(node.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canEditNode(node)) {
                event.preventDefault();
                onActivate?.();
                setEditingNode(node.id);
              }
            }}
          >
            {editingNode === node.id ? (
              <input
                className="mind-node-input"
                defaultValue={node.text}
                autoFocus
                maxLength={90}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  if (event.currentTarget.dataset.cancelEdit === "true") {
                    setEditingNode(null);
                    return;
                  }
                  finishEditing(node, event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.dataset.cancelEdit = "true";
                    event.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span>{node.text}</span>
            )}
            {node.linkedCardId && !editingNode && (
              <button
                className="linked-note-indicator"
                type="button"
                aria-label={`Open details for ${node.text}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onLinkedCardSelect?.(node.linkedCardId, node.text);
                }}
              >
                <Note size={12} weight="fill" />
                Details
              </button>
            )}
            {isSelected &&
              canEditNode(node) &&
              !editingNode && (
              <button
                className="node-quick-edit"
                type="button"
                aria-label="Edit mind-map node"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setEditingNode(node.id)}
              >
                <ArrowBendDownRight size={14} weight="bold" />
              </button>
            )}
          </article>
        );
      })}

      {active && (
        <div
          className={`mind-tools ${
            selectedEdgeRecord
              ? "is-edge-tools"
              : selectedNodeRecord
                ? "is-node-tools"
                : ""
          }`}
          data-export-exclude="true"
          aria-label={
            selectedNodeRecord
              ? "Selected node actions"
              : selectedEdgeRecord
                ? "Selected connection actions"
                : "Mind map actions"
          }
        >
          {toolbarConfirmDelete ? (
            <>
              <strong className="mind-tools-confirm-copy">
                {selectedNodeRecord
                  ? "Delete this node and its connections?"
                  : "Delete this connection?"}
              </strong>
              <button
                type="button"
                onClick={() => setToolbarConfirmDelete(false)}
                disabled={selectionBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={removeSelection}
                disabled={selectionBusy}
              >
                <Trash size={17} />
                {selectionBusy ? "Deleting…" : "Delete"}
              </button>
            </>
          ) : selectedEdgeRecord ? (
            <>
              <span className="mind-tools-label">Connection</span>
              {EDGE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeEdgeShape(selectedEdgeRecord.shape) === shape.value
                      ? "is-active"
                      : ""
                  }
                  onClick={() => changeEdgeShape(selectedEdgeRecord, shape.value)}
                  disabled={!canEditEdge(selectedEdgeRecord) || menuBusy}
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
                    normalizeArrowType(selectedEdgeRecord.arrowType) ===
                    arrow.value
                      ? "is-active"
                      : ""
                  }
                  onClick={() =>
                    changeEdgeArrow(selectedEdgeRecord, arrow.value)
                  }
                  disabled={!canEditEdge(selectedEdgeRecord) || menuBusy}
                >
                  {arrow.label}
                </button>
              ))}
              <button
                type="button"
                className="is-danger"
                onClick={() => setToolbarConfirmDelete(true)}
                disabled={!canDeleteSelection}
              >
                <Trash size={17} />
                Delete connection
              </button>
              <button
                type="button"
                className="mind-done"
                onClick={onClose}
              >
                <Check size={17} weight="bold" />
                Done
              </button>
            </>
          ) : selectedNodeRecord ? (
            <>
              <span className="mind-tools-label">Node</span>
              <button
                type="button"
                onClick={() => setEditingNode(selectedNodeRecord.id)}
                disabled={!canEditNode(selectedNodeRecord)}
              >
                <PencilSimple size={17} />
                Edit
              </button>
              {NODE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeNodeShape(selectedNodeRecord.shape) === shape.value
                      ? "is-active"
                      : ""
                  }
                  onClick={() =>
                    changeNodeShape(selectedNodeRecord, shape.value)
                  }
                  disabled={!canEditNode(selectedNodeRecord) || menuBusy}
                >
                  {shape.label}
                </button>
              ))}
              <span className="mind-tools-divider" aria-hidden="true" />
              <button
                type="button"
                className={connectFrom ? "is-active" : ""}
                onClick={() => {
                  setConnectFrom(selectedNodeRecord.id);
                  onNotice("Choose a second node to connect");
                }}
                disabled={!canEditNode(selectedNodeRecord)}
              >
                <LinkSimple size={17} weight="bold" />
                Connect
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={() => setToolbarConfirmDelete(true)}
                disabled={!canDeleteSelection}
              >
                <Trash size={17} />
                Delete node
              </button>
              <button
                type="button"
                className="mind-done"
                onClick={() => {
                  setConnectFrom(null);
                  onClose();
                }}
              >
                <Check size={17} weight="bold" />
                Done
              </button>
            </>
          ) : (
            <>
              <span className="mind-tools-label">Mind map</span>
              <button type="button" onClick={addNode} disabled={locked}>
                <Plus size={17} weight="bold" />
                Add node
              </button>
              <button type="button" className="mind-done" onClick={onClose}>
                <Check size={17} weight="bold" />
                Done
              </button>
            </>
          )}
        </div>
      )}

      {contextMenu?.type === "node" && localNodes[contextMenu.id] && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Mind-map node actions"
          onClose={() => setContextMenu(null)}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canEditNode(localNodes[contextMenu.id])}
            onClick={() => {
              setEditingNode(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <PencilSimple size={17} />
            Edit text
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canEditNode(localNodes[contextMenu.id]) || locked}
            onClick={() => {
              setConnectFrom(contextMenu.id);
              setContextMenu(null);
              onNotice("Choose a second node to connect");
            }}
          >
            <LinkSimple size={17} />
            Connect from here
          </button>
          {localNodes[contextMenu.id].linkedCardId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onLinkedCardSelect?.(
                  localNodes[contextMenu.id].linkedCardId,
                  localNodes[contextMenu.id].text,
                );
                setContextMenu(null);
              }}
            >
              <Note size={17} />
              Open linked sticky note
            </button>
          )}
          <div className="context-menu-section">
            <span>Node shape</span>
            <div className="context-choice-grid is-three-column">
              {NODE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeNodeShape(localNodes[contextMenu.id].shape) ===
                    shape.value
                      ? "is-selected"
                      : ""
                  }
                  disabled={
                    !canEditNode(localNodes[contextMenu.id]) || menuBusy
                  }
                  onClick={() =>
                    changeNodeShape(localNodes[contextMenu.id], shape.value)
                  }
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
          {!canEditNode(localNodes[contextMenu.id]) && (
            <p className="context-menu-note">
              Only the creator or board owner can edit this node.
            </p>
          )}
          {canEditNode(localNodes[contextMenu.id]) && !confirmDelete && (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash size={17} />
              Delete node
            </button>
          )}
          {canEditNode(localNodes[contextMenu.id]) && confirmDelete && (
            <div className="context-confirm">
              <strong>Delete this node and its connections?</strong>
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
                  onClick={deleteContextItem}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </ContextMenu>
      )}

      {contextMenu?.type === "edge" && localEdges[contextMenu.id] && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label="Mind-map connection actions"
          onClose={() => setContextMenu(null)}
        >
          <div className="context-menu-section">
            <span>Connection shape</span>
            <div className="context-choice-grid is-two-column">
              {EDGE_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={
                    normalizeEdgeShape(localEdges[contextMenu.id].shape) ===
                    shape.value
                      ? "is-selected"
                      : ""
                  }
                  disabled={
                    !canEditEdge(localEdges[contextMenu.id]) || menuBusy
                  }
                  onClick={() =>
                    changeEdgeShape(localEdges[contextMenu.id], shape.value)
                  }
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
          <div className="context-menu-section">
            <span>Endpoints</span>
            <div className="context-choice-grid">
              {ARROW_TYPES.map((arrow) => (
                <button
                  key={arrow.value}
                  type="button"
                  className={
                    normalizeArrowType(localEdges[contextMenu.id].arrowType) ===
                    arrow.value
                      ? "is-selected"
                      : ""
                  }
                  disabled={
                    !canEditEdge(localEdges[contextMenu.id]) || menuBusy
                  }
                  onClick={() =>
                    changeEdgeArrow(
                      localEdges[contextMenu.id],
                      arrow.value,
                    )
                  }
                >
                  {arrow.label}
                </button>
              ))}
            </div>
          </div>
          {!canEditEdge(localEdges[contextMenu.id]) && (
            <p className="context-menu-note">
              Only the creator or board owner can edit this connection.
            </p>
          )}
          {canEditEdge(localEdges[contextMenu.id]) && !confirmDelete && (
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
          {canEditEdge(localEdges[contextMenu.id]) && confirmDelete && (
            <div className="context-confirm">
              <strong>Delete this connection?</strong>
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
                  onClick={deleteContextItem}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </ContextMenu>
      )}

    </div>
  );
}
