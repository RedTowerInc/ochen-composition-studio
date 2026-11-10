import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MousePointer2, Sparkles } from "lucide-react";
import {
  assetKey,
  assetMarkup,
  instanceTransform,
  type AssetStore,
  type LoadedAsset,
} from "../core/svg";
import {
  familyById,
  type Catalog,
  type SceneDocument,
  type SceneInstance,
} from "../core/types";

const ObjectShape = memo(function ObjectShape({
  item,
  scene,
  catalog,
  asset,
}: {
  item: SceneInstance;
  scene: SceneDocument;
  catalog: Catalog;
  asset: LoadedAsset;
}) {
  const signature = JSON.stringify(scene.palette.colors);
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  // Dragging changes only a group's transform. Original vector markup stays cached.
  const markup = useMemo(
    () => assetMarkup(asset, `view_${scope}_${item.id}`, scene, catalog),
    [asset, item.id, catalog, signature, scope],
  );
  return (
    <g
      transform={instanceTransform(item, scene, catalog, asset)}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

export function SceneView({
  scene,
  catalog,
  assets,
  selected,
  onSelect,
  onMove,
  interactive = false,
  interactionDisabled = false,
  svgRef,
}: {
  scene: SceneDocument;
  catalog: Catalog;
  assets: AssetStore;
  selected?: string;
  onSelect?: (id?: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  interactive?: boolean;
  interactionDisabled?: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
}) {
  const localRef = useRef<SVGSVGElement>(null),
    ref = svgRef ?? localRef;
  const gesture = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    item: SceneInstance;
    x: number;
    y: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const cancel = () => {
    const g = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (g && ref.current?.hasPointerCapture(g.pointerId))
      ref.current.releasePointerCapture(g.pointerId);
  };
  useEffect(() => {
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  useEffect(cancel, [scene.id, scene.revision, interactionDisabled]);
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const matrix = ref.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
  };
  const start = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (
      !interactive ||
      interactionDisabled ||
      event.button !== 0 ||
      gesture.current
    )
      return;
    const target = (event.target as Element).closest("[data-instance]"),
      id = target?.getAttribute("data-instance") ?? undefined;
    onSelect?.(id);
    const item = scene.instances.find((item) => item.id === id),
      p = point(event);
    if (!item || !p) return;
    event.preventDefault();
    ref.current?.setPointerCapture(event.pointerId);
    gesture.current = {
      id: item.id,
      pointerId: event.pointerId,
      startX: p.x,
      startY: p.y,
      item,
      x: item.x,
      y: item.y,
    };
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current,
      p = point(event);
    if (!g || g.pointerId !== event.pointerId || !p) return;
    g.x = Math.max(-2, Math.min(3, g.item.x + (p.x - g.startX) / scene.width));
    g.y = Math.max(-2, Math.min(3, g.item.y + (p.y - g.startY) / scene.height));
    setPreview({ id: g.id, x: g.x, y: g.y });
  };
  const finish = (event: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    setPreview(null);
    if (ref.current?.hasPointerCapture(event.pointerId))
      ref.current.releasePointerCapture(event.pointerId);
    if (g.item.x !== g.x || g.item.y !== g.y) onMove?.(g.id, g.x, g.y);
  };
  const bgToken = Object.keys(catalog.colorRoles).find(
    (key) => catalog.colorRoles[key] === "background",
  )!;
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      xmlns="http://www.w3.org/2000/svg"
      className={interactive ? "scene interactive-scene" : "scene"}
      aria-label={interactive ? "Холст композиции" : "Предпросмотр композиции"}
      role={interactive ? "group" : "img"}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      <rect
        width={scene.width}
        height={scene.height}
        fill={scene.palette.colors[bgToken]}
      />
      {scene.instances.map((original) => {
        const item =
          preview?.id === original.id
            ? { ...original, x: preview.x, y: preview.y }
            : original;
        const asset = assets.get(
          assetKey(item.familyId, scene.detail, item.role),
        );
        if (!asset) return null;
        const family = familyById(catalog, item.familyId),
          factor = scene.scale * asset.variant.sourceScale;
        const width = asset.variant.viewBox[2] * factor,
          height = asset.variant.viewBox[3] * factor;
        return (
          <g
            key={item.id}
            data-instance={interactive ? item.id : undefined}
            className={interactive ? "scene-object" : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? family.name : undefined}
            onFocus={interactive ? () => onSelect?.(item.id) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(item.id);
                    }
                  }
                : undefined
            }
          >
            <ObjectShape
              item={item}
              scene={scene}
              catalog={catalog}
              asset={asset}
            />
            {interactive && selected === item.id && (
              <g
                transform={`translate(${item.x * scene.width} ${item.y * scene.height}) rotate(${item.rotation})`}
                pointerEvents="none"
              >
                <rect
                  x={-width / 2 - 7}
                  y={-height / 2 - 7}
                  width={width + 14}
                  height={height + 14}
                  fill="none"
                  stroke="#7960D8"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Canvas({
  scene,
  catalog,
  assets,
  selected,
  onSelect,
  onMove,
  interactionDisabled = false,
}: {
  scene: SceneDocument;
  catalog: Catalog;
  assets: AssetStore;
  selected?: string;
  onSelect: (id?: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  interactionDisabled?: boolean;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 }),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!area.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  const fitted = Math.max(
    1,
    Math.min(size.width, (size.height * scene.width) / scene.height, 1100),
  );
  return (
    <section className="canvas-section" aria-label="Рабочая область">
      <div className="canvas-topline">
        <span>
          <span className="canvas-dot" />
          {scene.width} × {scene.height}
        </span>
      </div>
      <div className="canvas-area" ref={area}>
        <div className="artboard-wrap" style={{ width: fitted * zoom }}>
          <div
            className="artboard"
            style={{ aspectRatio: `${scene.width}/${scene.height}` }}
          >
            <SceneView
              scene={scene}
              catalog={catalog}
              assets={assets}
              selected={selected}
              onSelect={onSelect}
              onMove={onMove}
              interactive
              interactionDisabled={interactionDisabled}
            />
            {!scene.instances.length && (
              <div className="canvas-empty">
                <div className="empty-orbit">
                  <Sparkles size={28} />
                </div>
                <h2>Всё начинается с идеи</h2>
                <p>
                  Опишите её слева или добавьте
                  <br />
                  объект из библиотеки.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="canvas-bottom">
        <span>
          <MousePointer2 size={13} />
          Перетаскивайте объекты на холсте
        </span>
        <div className="zoom-control">
          <button
            aria-label="Уменьшить масштаб"
            disabled={zoom <= 0.5}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            −
          </button>
          <button onClick={() => setZoom(1)} title="Вписать в рабочую область">
            {zoom === 1 ? "Вписать" : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            aria-label="Увеличить масштаб"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
