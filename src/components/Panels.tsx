import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Layers3,
  Palette as PaletteIcon,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  LAYOUTS,
  resizeScene,
  type CompositionCandidate,
} from "../core/composition";
import { assetKey, type AssetStore } from "../core/svg";
import {
  familyById,
  LIMITS,
  type Catalog,
  type Palette,
  type SceneDocument,
  type SceneInstance,
} from "../core/types";
import type { InputMode } from "../core/semantics";
import { SceneView } from "./SceneView";

export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="panel-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Закрыть панель"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Sidebar({
  scene,
  catalog,
  assets,
  selected,
  onSelect,
  onAdd,
  onLayer,
  mode,
  setMode,
  prompt,
  setPrompt,
  busy,
  onGenerate,
  onCancel,
  explanation,
  background,
  setBackground,
}: {
  scene: SceneDocument;
  catalog: Catalog;
  assets: AssetStore;
  selected?: string;
  onSelect: (id?: string) => void;
  onAdd: (id: string) => void;
  onLayer: (id: string, direction: -1 | 1) => void;
  mode: InputMode;
  setMode: (mode: InputMode) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  busy: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  explanation: string;
  background: boolean;
  setBackground: (value: boolean) => void;
}) {
  const [tab, setTab] = useState("compose"),
    [search, setSearch] = useState(""),
    promptId = useId();
  const tabs = [
    { id: "compose", title: "Собрать", icon: Sparkles },
    { id: "objects", title: "Объекты", icon: Search },
    { id: "layers", title: "Слои", icon: Layers3 },
  ];
  return (
    <div className="sidebar-inner">
      <nav className="sidebar-tabs" aria-label="Инструменты">
        {tabs.map(({ id, title, icon: Icon }) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            <Icon size={16} />
            {title}
          </button>
        ))}
      </nav>
      {tab === "compose" && (
        <div className="sidebar-content">
          <span className="eyebrow">ОТ СЛОВ К КОМПОЗИЦИИ</span>
          <h1>
            Какая у вас
            <br />
            идея?
          </h1>
          <p className="muted intro">
            {mode === "meaning"
              ? "Темы: деньги, фокус, учёба, идеи, время, общение, отдых и работа."
              : "Укажите названия из библиотеки через запятую или добавьте объекты вручную."}
          </p>
          <div className="segmented" aria-label="Способ подбора">
            <button
              aria-pressed={mode === "meaning"}
              onClick={() => setMode("meaning")}
            >
              По смыслу
            </button>
            <button
              aria-pressed={mode === "objects"}
              onClick={() => setMode("objects")}
            >
              По объектам
            </button>
          </div>
          <label className="field-label" htmlFor={promptId}>
            {mode === "meaning"
              ? "Заголовок или метафора"
              : "Объекты через запятую"}
          </label>
          <textarea
            id={promptId}
            value={prompt}
            maxLength={LIMITS.prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              mode === "meaning"
                ? "Например, сосредоточиться на главном"
                : "Книга, наушники, лампа"
            }
            rows={4}
          />
          <div className="input-meta">
            <span>
              {mode === "meaning"
                ? "Подбор по смысловым темам"
                : "Названия из библиотеки"}
            </span>
            <span>
              {prompt.length}/{LIMITS.prompt}
            </span>
          </div>
          <label className="background-toggle">
            <input
              type="checkbox"
              checked={background}
              onChange={(event) => setBackground(event.target.checked)}
            />
            Добавить фоновый объект
          </label>
          <button
            className="primary full"
            onClick={busy ? onCancel : onGenerate}
            disabled={!busy && !prompt.trim()}
          >
            <Sparkles size={17} />
            {busy ? "Отменить сборку" : "Собрать композицию"}
          </button>
          <div className="examples">
            <span className="field-label">Попробуйте идею</span>
            {[
              "Сосредоточиться на главном",
              "Время для новых идей",
              "Учиться с удовольствием",
            ].map((text) => (
              <button
                key={text}
                onClick={() => {
                  setMode("meaning");
                  setPrompt(text);
                }}
              >
                {text}
                <span>↗</span>
              </button>
            ))}
          </div>
          {explanation && (
            <div className="explanation" role="status">
              <Check size={15} />
              <p>{explanation}</p>
            </div>
          )}
          <div className="sidebar-note">
            <div className="note-mark">о.</div>
            <p>
              Оригинальная библиотека
              <br />
              <strong>Студии Очень</strong>
            </p>
          </div>
        </div>
      )}
      {tab === "objects" && (
        <div className="sidebar-content">
          <div className="section-title">
            <h2>Библиотека</h2>
            <span className="badge">{catalog.families.length}</span>
          </div>
          <p className="muted small">
            Нажмите на объект, чтобы добавить его на холст.
          </p>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Поиск объекта"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти объект"
            />
          </label>
          <div className="object-grid">
            {catalog.families
              .filter((f) =>
                [f.name, ...f.aliases].some((name) =>
                  name
                    .toLocaleLowerCase("ru")
                    .includes(search.toLocaleLowerCase("ru")),
                ),
              )
              .map((family) => {
                const preview = {
                  ...scene,
                  width: 300,
                  height: 240,
                  scale:
                    180 /
                    Math.max(family.canonicalWidth, family.canonicalHeight),
                  instances: [
                    {
                      id: `thumb-${family.id}`,
                      familyId: family.id,
                      role: "main" as const,
                      x: 0.5,
                      y: 0.5,
                      rotation: -8,
                    },
                  ],
                };
                return (
                  <button
                    className="object-card"
                    key={family.id}
                    onClick={() => onAdd(family.id)}
                    disabled={scene.instances.length >= LIMITS.instances}
                  >
                    <SceneView
                      scene={preview}
                      catalog={catalog}
                      assets={assets}
                    />
                    <span>
                      {family.name}
                      <span>+</span>
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
      {tab === "layers" && (
        <div className="sidebar-content">
          <div className="section-title">
            <h2>Слои</h2>
            <span className="badge">{scene.instances.length}</span>
          </div>
          <p className="muted small">Верхний в списке — передний на холсте.</p>
          {!scene.instances.length && (
            <p className="empty-note">Здесь появятся добавленные объекты.</p>
          )}
          <div className="layer-list">
            {[...scene.instances].reverse().map((item) => (
              <div
                key={item.id}
                className={`layer-row ${selected === item.id ? "selected" : ""}`}
              >
                <button
                  className="layer-select"
                  aria-pressed={selected === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <Layers3 size={15} />
                  <span>
                    {familyById(catalog, item.familyId).name}
                    <small>
                      {item.role === "main" ? "Главный" : "Фоновый"}
                    </small>
                  </span>
                </button>
                <button
                  className="icon-button"
                  aria-label="На слой выше"
                  disabled={scene.instances.at(-1)?.id === item.id}
                  onClick={() => onLayer(item.id, 1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="На слой ниже"
                  disabled={scene.instances[0]?.id === item.id}
                  onClick={() => onLayer(item.id, -1)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Inspector({
  scene,
  catalog,
  selected,
  onChange,
  onObjectChange,
  onDuplicate,
  onDelete,
  onLayer,
  onPaletteImport,
  onPaletteSample,
}: {
  scene: SceneDocument;
  catalog: Catalog;
  selected?: SceneInstance;
  onChange: (scene: SceneDocument) => void;
  onObjectChange: (
    patch: Partial<Pick<SceneInstance, "role" | "rotation" | "x" | "y">>,
  ) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (direction: -1 | 1) => void;
  onPaletteImport: (file: File) => void;
  onPaletteSample: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    id = useId();
  const samePalette = (palette: Palette) =>
    Object.keys(catalog.colorRoles).every(
      (token) => scene.palette.colors[token] === palette.colors[token],
    );
  const [width, setWidth] = useState(String(scene.width)),
    [height, setHeight] = useState(String(scene.height));
  const [rotation, setRotation] = useState(selected?.rotation ?? 0),
    [sizeError, setSizeError] = useState("");
  const rotationCancelled = useRef(false);
  useEffect(() => {
    setWidth(String(scene.width));
    setHeight(String(scene.height));
  }, [scene.width, scene.height]);
  useEffect(
    () => setRotation(selected?.rotation ?? 0),
    [selected?.id, selected?.rotation],
  );
  const resize = (w: number, h: number) => {
    try {
      onChange(resizeScene(scene, w, h));
      setSizeError("");
    } catch (error) {
      setSizeError((error as Error).message);
    }
  };
  const formats = [
    { label: "16:9", w: 1200, h: 675 },
    { label: "1:1", w: 1000, h: 1000 },
    { label: "4:5", w: 800, h: 1000 },
  ];
  return (
    <div className="inspector-inner">
      <div className="inspector-heading">
        <SlidersHorizontal size={16} />
        <h2>Композиция</h2>
      </div>
      <section className="inspector-section">
        <h3>Формат холста</h3>
        <div className="format-options">
          {formats.map((format) => (
            <button
              key={format.label}
              aria-pressed={
                scene.width === format.w && scene.height === format.h
              }
              onClick={() => resize(format.w, format.h)}
            >
              <span
                className="format-icon"
                style={{ aspectRatio: `${format.w}/${format.h}` }}
              />
              <span>{format.label}</span>
            </button>
          ))}
        </div>
        <div className="dimension-fields">
          <label>
            Ширина
            <input
              aria-label="Ширина холста"
              type="number"
              min={128}
              max={4096}
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              onBlur={() => {
                if (
                  Number(width) !== scene.width ||
                  Number(height) !== scene.height
                )
                  resize(Number(width), Number(height));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  resize(Number(width), Number(height));
              }}
            />
          </label>
          <span>×</span>
          <label>
            Высота
            <input
              aria-label="Высота холста"
              type="number"
              min={128}
              max={4096}
              value={height}
              onChange={(event) => setHeight(event.target.value)}
              onBlur={() => {
                if (
                  Number(width) !== scene.width ||
                  Number(height) !== scene.height
                )
                  resize(Number(width), Number(height));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  resize(Number(width), Number(height));
              }}
            />
          </label>
          <span className="unit">px</span>
        </div>
        {sizeError && (
          <p className="field-error" role="alert">
            {sizeError}
          </p>
        )}
      </section>
      <section className="inspector-section">
        <div className="section-title">
          <h3>Детализация</h3>
          <span
            className="help-dot"
            title="Два исходных варианта иллюстраций из библиотеки"
          >
            ?
          </span>
        </div>
        <div className="detail-options">
          {(["S", "L"] as const).map((detail) => (
            <button
              key={detail}
              aria-pressed={scene.detail === detail}
              onClick={() => onChange({ ...scene, detail })}
            >
              <span>{detail}</span>
              <small>
                {detail === "S" ? "Меньше деталей" : "Больше деталей"}
              </small>
              {scene.detail === detail && <Check size={13} />}
            </button>
          ))}
        </div>
      </section>
      <section className="inspector-section">
        <div className="section-title">
          <h3>Палитра</h3>
          <PaletteIcon size={14} />
        </div>
        <div className="palettes">
          {catalog.palettes.map((palette) => (
            <button
              key={palette.id}
              className="palette-option"
              aria-pressed={samePalette(palette)}
              onClick={() => onChange({ ...scene, palette })}
            >
              <span className="palette-swatches">
                {Object.entries(palette.colors)
                  .filter(([token]) => catalog.colorRoles[token] !== "neutral")
                  .slice(0, 5)
                  .map(([token, color]) => (
                    <i key={token} style={{ background: color }} />
                  ))}
              </span>
              <span>{palette.name}</span>
              <span className="palette-check">
                {samePalette(palette) && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
        {!catalog.palettes.some(samePalette) && (
          <div className="custom-palette">
            <Check size={14} />
            {scene.palette.name}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPaletteImport(file);
            event.target.value = "";
          }}
        />
        <button
          className="secondary full"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} />
          Загрузить JSON-палитру
        </button>
        <button
          className="text-button palette-sample"
          onClick={onPaletteSample}
        >
          <Download size={12} />
          Образец JSON
        </button>
        <p className="fine-print">
          Цветовые роли сохраняются: фон, акценты и нейтральные контуры.
        </p>
      </section>
      {selected ? (
        <section className="inspector-section object-inspector">
          <div className="section-title">
            <h3>{familyById(catalog, selected.familyId).name}</h3>
            <span className="badge">Объект</span>
          </div>
          <label className="field-label" htmlFor={`${id}-role`}>
            Роль в композиции
          </label>
          <select
            id={`${id}-role`}
            value={selected.role}
            onChange={(event) =>
              onObjectChange({
                role: event.target.value as "main" | "background",
              })
            }
          >
            <option value="main">Главный · цветной</option>
            <option value="background">Фоновый · монохромный</option>
          </select>
          <div className="rotation-heading">
            <label className="field-label" htmlFor={`${id}-rotation`}>
              Поворот
            </label>
            <output>{Math.round(rotation)}°</output>
          </div>
          <input
            id={`${id}-rotation`}
            aria-label="Поворот объекта"
            type="range"
            min="-180"
            max="180"
            value={rotation}
            onChange={(event) => {
              rotationCancelled.current = false;
              setRotation(Number(event.target.value));
            }}
            onPointerDown={() => { rotationCancelled.current = false; }}
            onPointerCancel={() => {
              rotationCancelled.current = true;
              setRotation(selected.rotation);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                rotationCancelled.current = true;
                setRotation(selected.rotation);
                event.currentTarget.blur();
              }
            }}
            onPointerUp={() => {
              if (!rotationCancelled.current && rotation !== selected.rotation) onObjectChange({ rotation });
            }}
            onKeyUp={(event) => {
              if (event.key !== "Escape" && !rotationCancelled.current && rotation !== selected.rotation) onObjectChange({ rotation });
            }}
            onBlur={() => {
              if (rotationCancelled.current) return;
              if (rotation !== selected.rotation) onObjectChange({ rotation });
            }}
          />
          <div className="object-actions">
            <button
              className="secondary"
              onClick={onDuplicate}
              disabled={scene.instances.length >= LIMITS.instances}
            >
              <Copy size={14} />
              Дубликат
            </button>
            <button
              className="secondary danger"
              onClick={onDelete}
              aria-label="Удалить объект"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="object-actions">
            <button
              className="secondary"
              onClick={() => onLayer(1)}
              disabled={scene.instances.at(-1)?.id === selected.id}
            >
              <ArrowUp size={14} />
              Выше
            </button>
            <button
              className="secondary"
              onClick={() => onLayer(-1)}
              disabled={scene.instances[0]?.id === selected.id}
            >
              <ArrowDown size={14} />
              Ниже
            </button>
          </div>
          <button
            className="text-button"
            onClick={() => onObjectChange({ x: 0.5, y: 0.5, rotation: 0 })}
          >
            <RotateCcw size={12} />В центр холста
          </button>
        </section>
      ) : (
        <div className="selection-hint">
          <span>↖</span>
          <p>
            Выберите объект на холсте,
            <br />
            чтобы настроить его.
          </p>
        </div>
      )}
    </div>
  );
}

export function Candidates({
  candidates,
  catalog,
  assets,
  onApply,
  disabled,
  busy,
}: {
  candidates: CompositionCandidate[];
  catalog: Catalog;
  assets: AssetStore;
  onApply: (scene: SceneDocument) => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <section className="candidates">
      <div className="candidates-heading">
        <h2>Варианты композиции</h2>
        <span>
          {busy
            ? "Собираем варианты…"
            : candidates.length
              ? "Выберите вариант"
              : "Появятся после сборки"}
        </span>
      </div>
      <div className="candidate-grid">
        {(candidates.length
          ? candidates.map((scene) => ({
              scene,
              layout: LAYOUTS.find((layout) => layout.id === scene.layout)!,
            }))
          : LAYOUTS.map((layout) => ({
              layout,
              scene: undefined as CompositionCandidate | undefined,
            }))
        ).map(({ layout, scene }, index) => {
          return (
            <button
              key={layout.id}
              className={`candidate-card ${!scene ? "placeholder" : ""}`}
              disabled={!scene || disabled || busy}
              onClick={() => scene && onApply(scene)}
            >
              <div className="candidate-art">
                {scene ? (
                  <SceneView scene={scene} catalog={catalog} assets={assets} />
                ) : (
                  <div className="candidate-placeholder">
                    <Sparkles size={20} />
                    <span>0{index + 1}</span>
                  </div>
                )}
              </div>
              <div className="candidate-label">
                <span>{scene?.fallback ? "Вписано в холст" : layout.name}</span>
                <small>
                  {scene?.fallback
                    ? "Все выбранные предметы видны"
                    : layout.description}
                </small>
              </div>
              <span className="candidate-apply">↗</span>
            </button>
          );
        })}
      </div>
      {disabled && !!candidates.length && (
        <p className="fine-print">
          Композиция изменена. Соберите новые варианты для текущих параметров.
        </p>
      )}
    </section>
  );
}
