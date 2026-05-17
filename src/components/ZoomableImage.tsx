import { useEffect, useRef, useState } from "react";

type Pt = { x: number; y: number };

export function ZoomableImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const pointersRef = useRef<Map<number, Pt>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    scale: number;
    midContainer: Pt;
    tx: number;
    ty: number;
  } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const MIN = 1;
  const MAX = 6;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const applyZoomAt = (newScale: number, cx: number, cy: number) => {
    const s = clamp(newScale, MIN, MAX);
    // Keep the container point (cx, cy) anchored: cx = tx + scale * ox
    // ox = (cx - tx) / scale; new tx = cx - s * ox
    const ox = (cx - tx) / scale;
    const oy = (cy - ty) / scale;
    let nx = cx - s * ox;
    let ny = cy - s * oy;
    if (s === 1) {
      nx = 0;
      ny = 0;
    }
    setScale(s);
    setTx(nx);
    setTy(ny);
  };

  const getContainerPoint = (e: { clientX: number; clientY: number }): Pt => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = getContainerPoint({
        clientX: (pts[0].x + pts[1].x) / 2,
        clientY: (pts[0].y + pts[1].y) / 2,
      });
      pinchStartRef.current = { dist, scale, midContainer: mid, tx, ty };
      panStartRef.current = null;
      return;
    }

    // Double-tap detection
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.t < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30) {
      const cp = getContainerPoint(e);
      if (scale > 1.05) {
        setScale(1);
        setTx(0);
        setTy(0);
      } else {
        applyZoomAt(2.5, cp.x, cp.y);
      }
      lastTapRef.current = null;
      return;
    }
    lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };

    if (scale > 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      e.stopPropagation();
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const start = pinchStartRef.current;
      const ratio = dist / Math.max(1, start.dist);
      const s = clamp(start.scale * ratio, MIN, MAX);
      const { midContainer } = start;
      const ox = (midContainer.x - start.tx) / start.scale;
      const oy = (midContainer.y - start.ty) / start.scale;
      setScale(s);
      setTx(midContainer.x - s * ox);
      setTy(midContainer.y - s * oy);
      return;
    }

    if (panStartRef.current && scale > 1) {
      e.stopPropagation();
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTx(panStartRef.current.tx + dx);
      setTy(panStartRef.current.ty + dy);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) panStartRef.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    e.stopPropagation();
    const cp = getContainerPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    applyZoomAt(scale * factor, cp.x, cp.y);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const cp = getContainerPoint(e);
    if (scale > 1.05) {
      setScale(1);
      setTx(0);
      setTy(0);
    } else {
      applyZoomAt(2.5, cp.x, cp.y);
    }
  };

  // Prevent the page from bouncing when pinching inside.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: "none", overflow: "hidden", cursor: scale > 1 ? "grab" : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="block h-full w-full select-none object-contain"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transformOrigin: "0 0",
          transition: pointersRef.current.size === 0 ? "transform 0.15s ease-out" : "none",
        }}
      />
    </div>
  );
}
