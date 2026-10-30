import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_GAP = 10;

export function ContextMenu({ x, y, label, onClose, children }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(
        VIEWPORT_GAP,
        Math.min(x, window.innerWidth - bounds.width - VIEWPORT_GAP),
      ),
      top: Math.max(
        VIEWPORT_GAP,
        Math.min(y, window.innerHeight - bounds.height - VIEWPORT_GAP),
      ),
    });
  }, [x, y]);

  useEffect(() => {
    function closeFromOutside(event) {
      if (!menuRef.current?.contains(event.target)) onClose();
    }
    function closeFromKeyboard(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("contextmenu", closeFromOutside, true);
    window.addEventListener("keydown", closeFromKeyboard);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("contextmenu", closeFromOutside, true);
      window.removeEventListener("keydown", closeFromKeyboard);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={position}
      role="menu"
      aria-label={label}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
