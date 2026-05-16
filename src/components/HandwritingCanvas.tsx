import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

export interface HandwritingCanvasHandle {
  clear: () => void;
  /** Returns a PNG blob of the sticky note (background + ink) at native resolution */
  toBlob: () => Promise<Blob | null>;
  isEmpty: () => boolean;
  /** Load an existing image (e.g. signed URL) into the canvas as the starting drawing. */
  loadFromUrl: (url: string) => Promise<void>;
  /** Switch between pen and eraser tools. */
  setTool: (tool: "pen" | "eraser") => void;
  getTool: () => "pen" | "eraser";
  /** Add more vertical writing space, preserving existing ink. */
  extend: (extraPx?: number) => void;
  /** Arm a one-shot stamp: the next tap on the canvas paints a bullet ("•") or
   *  auto-incrementing number ("1.", "2.", …) instead of starting a stroke. */
  stampNext: (type: "bullet" | "number") => void;
  /** Reset the auto-incrementing number counter back to 1. */
  resetNumbering: () => void;
  /** Cancel a pending stamp (if any). */
  cancelStamp: () => void;
}

interface Props {
  className?: string;
  /** Called after a pending stamp is placed on the canvas. */
  onStampPlaced?: (type: "bullet" | "number") => void;
}

/**
 * Sticky-note handwriting canvas.
 * - Uses pointer events so Apple Pencil, touch, and mouse all work.
 * - Prevents page scrolling while drawing (touch-action: none).
 * - Background is light yellow and is preserved in the exported PNG.
 */
export const HandwritingCanvas = forwardRef<HandwritingCanvasHandle, Props>(
  function HandwritingCanvas({ className, onStampPlaced }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const dirtyRef = useRef(false);
    const toolRef = useRef<"pen" | "eraser">("pen");
    const stampPendingRef = useRef<"bullet" | "number" | null>(null);
    const stampDraggingRef = useRef(false);
    const lastStampPosRef = useRef<{ x: number; y: number } | null>(null);
    const numberCounterRef = useRef<number>(1);
    const [extraHeight, setExtraHeight] = useState(0);

    // Paint the sticky-note yellow background.
    const paintBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      // Match --sticky-yellow visually with a safe rgb fallback.
      ctx.fillStyle = "#fff2a8";
      ctx.fillRect(0, 0, w, h);
    };

    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width === w && canvas.height === h) return;

      // Preserve existing drawing on resize
      const prev = document.createElement("canvas");
      prev.width = canvas.width;
      prev.height = canvas.height;
      const prevCtx = prev.getContext("2d");
      if (prevCtx && canvas.width > 0) prevCtx.drawImage(canvas, 0, 0);

      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      paintBackground(ctx, w, h);
      if (prev.width > 0) ctx.drawImage(prev, 0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 3 * dpr;
    };

    useEffect(() => {
      resize();
      const ro = new ResizeObserver(resize);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const placeStamp = (x: number, y: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !stampPendingRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fontPx = 28 * dpr;
      const text =
        stampPendingRef.current === "bullet"
          ? "•"
          : `${numberCounterRef.current++}.`;
      ctx.save();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `600 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(text, x, y);
      ctx.restore();
      dirtyRef.current = true;
      lastStampPosRef.current = { x, y };
      if (stampPendingRef.current) onStampPlaced?.(stampPendingRef.current);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      // Sticky stamp mode: place a marker on tap, and continue placing along
      // the drag path. Mode stays active until the caller cancels it.
      if (stampPendingRef.current) {
        const p = getPos(e);
        stampDraggingRef.current = true;
        lastStampPosRef.current = null;
        placeStamp(p.x, p.y);
        return;
      }
      drawingRef.current = true;
      lastRef.current = getPos(e);
    };
    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Stamp-drag: place additional markers spaced along the drag path.
      if (stampDraggingRef.current && stampPendingRef.current) {
        e.preventDefault();
        const p = getPos(e);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // Min spacing between markers (in canvas px) so drags don't pile up.
        const minSpacing =
          (stampPendingRef.current === "bullet" ? 40 : 56) * dpr;
        const last = lastStampPosRef.current;
        if (!last) {
          placeStamp(p.x, p.y);
          return;
        }
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (Math.hypot(dx, dy) >= minSpacing) {
          placeStamp(p.x, p.y);
        }
        return;
      }
      if (!drawingRef.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx || !lastRef.current) return;
      const p = getPos(e);
      // Pen pressure when available (Apple Pencil)
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (toolRef.current === "eraser") {
        // Erase by painting over with the sticky-note background color.
        ctx.save();
        ctx.strokeStyle = "#fff2a8";
        ctx.lineWidth = 18 * dpr;
        ctx.beginPath();
        ctx.moveTo(lastRef.current.x, lastRef.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = (1.5 + pressure * 3.5) * dpr;
        ctx.beginPath();
        ctx.moveTo(lastRef.current.x, lastRef.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      lastRef.current = p;
      dirtyRef.current = true;
    };
    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      drawingRef.current = false;
      stampDraggingRef.current = false;
      lastRef.current = null;
      try {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };


    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        paintBackground(ctx, canvas.width, canvas.height);
        dirtyRef.current = false;
      },
      isEmpty: () => !dirtyRef.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((b) => resolve(b), "image/png");
        }),
      loadFromUrl: (url: string) =>
        new Promise((resolve, reject) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve();
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve();
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            paintBackground(ctx, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            dirtyRef.current = true;
            resolve();
          };
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = url;
        }),
      setTool: (tool) => {
        toolRef.current = tool;
      },
      getTool: () => toolRef.current,
      extend: (extraPx = 300) => {
        setExtraHeight((h) => h + extraPx);
      },
      stampNext: (type) => {
        stampPendingRef.current = type;
        if (canvasRef.current) canvasRef.current.style.cursor = "copy";
      },
      resetNumbering: () => {
        numberCounterRef.current = 1;
      },
      cancelStamp: () => {
        stampPendingRef.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
      },
    }));

    // Base height tracks container width via aspect ratio; extend grows it.
    const [baseHeight, setBaseHeight] = useState<number>(0);
    useEffect(() => {
      const c = containerRef.current;
      if (!c) return;
      const update = () => {
        const w = c.getBoundingClientRect().width;
        setBaseHeight(Math.round((w * 3) / 3.5));
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(c);
      return () => ro.disconnect();
    }, []);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: "100%",
          height: baseHeight ? `${baseHeight + extraHeight}px` : undefined,
          minHeight: baseHeight ? undefined : "300px",
          background: "var(--sticky-yellow)",
          borderRadius: "6px",
          boxShadow:
            "0 14px 28px -10px rgba(0,0,0,0.25), 0 6px 12px -6px rgba(0,0,0,0.18)",
          position: "relative",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor: "crosshair",
            borderRadius: "6px",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
          }}
        />
      </div>
    );
  },
);