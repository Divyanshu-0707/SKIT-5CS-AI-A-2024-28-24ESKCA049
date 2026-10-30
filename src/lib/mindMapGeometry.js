/*
 * Adapted from D:\MindMapprWeb\mindmap-geometry.js.
 * The field names and anchor behaviour stay compatible with Mind Mappr.
 */

const NODE_MIN_WIDTH = 180;
const NODE_MIN_HEIGHT = 60;

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeNodeShape(shape) {
  const raw = String(shape ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["rectangle", "rect", "square"].includes(raw)) return "rect";
  if (["rounded", "round", "rounded_rect", "roundedrect"].includes(raw)) {
    return "rounded";
  }
  if (["pill", "capsule"].includes(raw)) return "pill";
  if (["ellipse", "oval", "circle"].includes(raw)) return "ellipse";
  if (["diamond", "rhombus"].includes(raw)) return "diamond";
  return "rounded";
}

export function normalizeEdgeShape(shape) {
  const raw = String(shape ?? "")
    .trim()
    .toLowerCase();

  return raw === "straight" ? "straight" : "elbow";
}

export function normalizeArrowType(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["arrow", "end", "one_way", "single"].includes(raw)) return "arrow";
  if (
    ["double", "both", "two_way", "double_arrow", "double_sided"].includes(
      raw,
    )
  ) {
    return "double";
  }
  return "none";
}

export function getNodeWidth(node) {
  return Math.max(toNumber(node?.w, NODE_MIN_WIDTH), NODE_MIN_WIDTH);
}

export function getNodeHeight(node) {
  return Math.max(toNumber(node?.h, NODE_MIN_HEIGHT), NODE_MIN_HEIGHT);
}

export function getNodeCenter(node) {
  return {
    x: toNumber(node?.x, 0) + getNodeWidth(node) / 2,
    y: toNumber(node?.y, 0) + getNodeHeight(node) / 2,
  };
}

export function getAnchorPoint(node, toward) {
  const center = getNodeCenter(node);
  const width = getNodeWidth(node);
  const height = getNodeHeight(node);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const dx = toNumber(toward?.x, center.x) - center.x;
  const dy = toNumber(toward?.y, center.y) - center.y;
  const absoluteX = Math.abs(dx);
  const absoluteY = Math.abs(dy);

  if (absoluteX < 0.001 && absoluteY < 0.001) return center;

  const shape = normalizeNodeShape(node?.shape);
  let scale;

  if (shape === "ellipse") {
    const denominator =
      (dx * dx) / (halfWidth * halfWidth) +
      (dy * dy) / (halfHeight * halfHeight);
    scale = denominator <= 0 ? 1 : 1 / Math.sqrt(denominator);
  } else if (shape === "diamond") {
    const denominator = absoluteX / halfWidth + absoluteY / halfHeight;
    scale = denominator <= 0 ? 1 : 1 / denominator;
  } else {
    const xScale =
      absoluteX === 0 ? Number.POSITIVE_INFINITY : halfWidth / absoluteX;
    const yScale =
      absoluteY === 0 ? Number.POSITIVE_INFINITY : halfHeight / absoluteY;
    scale = Math.min(xScale, yScale);
  }

  if (shape === "pill" || shape === "rounded") {
    const inset = shape === "pill" ? Math.min(halfWidth, halfHeight) * 0.2 : 6;
    const denominator = Math.max(absoluteX, absoluteY);
    if (denominator > 0) scale = Math.max(0, scale - inset / denominator);
  }

  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  };
}

export function makeEdgePath(fromNode, toNode, shape) {
  const fromCenter = getNodeCenter(fromNode);
  const toCenter = getNodeCenter(toNode);
  const start = getAnchorPoint(fromNode, toCenter);
  const end = getAnchorPoint(toNode, fromCenter);

  if (normalizeEdgeShape(shape) === "straight") {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const horizontalDistance = Math.abs(end.x - start.x);
  const verticalDistance = Math.abs(end.y - start.y);
  if (horizontalDistance >= verticalDistance) {
    const middleX = (start.x + end.x) / 2;
    return `M ${start.x} ${start.y} L ${middleX} ${start.y} L ${middleX} ${end.y} L ${end.x} ${end.y}`;
  }

  const middleY = (start.y + end.y) / 2;
  return `M ${start.x} ${start.y} L ${start.x} ${middleY} L ${end.x} ${middleY} L ${end.x} ${end.y}`;
}
