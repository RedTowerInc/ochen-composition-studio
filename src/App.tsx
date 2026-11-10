import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  LoaderCircle,
  Menu,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { loadCatalog } from "./core/catalog";
import {
  addObject,
  changeObject,
  deleteObject,
  duplicateObject,
  moveLayer,
} from "./core/commands";
import { makeCandidates } from "./core/composition";
import { historyReducer } from "./core/history";
import { LatestJob, yieldToPaint } from "./core/jobs";
import {
  ProjectRepository,
  SaveQueue,
  type SavedDocument,
} from "./core/persistence";
import { selectObjects, type InputMode } from "./core/semantics";
import {
  downloadFile,
  exportScene,
  safeFileName,
  type AssetStore,
} from "./core/svg";
import {
  blankScene,
  clone,
  LIMITS,
  uid,
  type Catalog,
  type HistoryState,
  type SceneDocument,
} from "./core/types";
import { parseJsonFile, parsePalette, validateScene } from "./core/validation";
import { Canvas } from "./components/SceneView";
import { Candidates, Inspector, Modal, Sidebar } from "./components/Panels";

const repository = new ProjectRepository();
type Source = { catalog: Catalog; assets: AssetStore };
type OpenProject = {
  scene: SceneDocument;
  storageRevision: number;
  warning?: string;
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось выполнить действие. Попробуйте ещё раз.";

export default function App() {
  const [source, setSource] = useState<Source>(),
    [project, setProject] = useState<OpenProject>();
  const [attempt, setAttempt] = useState(0),
    [error, setError] = useState(""),
    [progress, setProgress] = useState([0, 40]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError("");
    setProgress([0, 40]);
    void (async () => {
      try {
        const loaded = await loadCatalog(controller.signal, (done, total) => {
          if (active) setProgress([done, total]);
        });
        let saved: SavedDocument | undefined,
          warning: string | undefined,
          storageBlocked = false;
        const onBlocked = () => {
          storageBlocked = true;
        };
        repository.db.on("blocked", onBlocked);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          saved = await Promise.race([
            repository.latest(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      storageBlocked
                        ? "Обновление хранилища заблокировано другой вкладкой. Закройте старую вкладку и повторите сохранение отдельной копии."
                        : "Локальное хранилище не отвечает. Можно работать и скачать проект файлом.",
                    ),
                  ),
                2500,
              );
            }),
          ]);
          if (saved)
            saved.document = validateScene(saved.document, loaded.catalog);
        } catch (e) {
          warning = errorMessage(e);
          saved = undefined;
        } finally {
          if (timer) clearTimeout(timer);
          repository.db.on("blocked").unsubscribe(onBlocked);
        }
        if (!active) return;
        setSource(loaded);
        setProject({
          scene: saved?.document ?? blankScene(loaded.catalog),
          storageRevision: saved?.storageRevision ?? 0,
          warning,
        });
      } catch (e) {
        if (active) {
          controller.abort();
          setError(errorMessage(e));
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);
  if (!source || !project)
    return (
      <main className="boot-screen">
        <a className="boot-brand" href="#">
          <span className="brand-mark">о.</span>
          <span>композиция</span>
        </a>
        <div className="boot-card">
          <div className="boot-symbol">
            <Sparkles size={30} />
          </div>
          <span className="eyebrow">ВЕКТОРНАЯ СТУДИЯ</span>
          <h1>
            {error
              ? "Библиотека пока недоступна"
              : "Готовим место для вашей идеи"}
          </h1>
          <p>
            {error ||
              "Загружаем оригинальные иллюстрации, палитры и варианты детализации."}
          </p>
          {error ? (
            <button
              className="primary"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Повторить загрузку
            </button>
          ) : (
            <>
              <progress value={progress[0]} max={progress[1]} />
              <span className="fine-print">
                {progress[0]} из {progress[1]} объектов
              </span>
            </>
          )}
        </div>
        <span className="boot-footer">
          Из слов — в вектор. Из деталей — в историю.
        </span>
      </main>
    );
  return (
    <Editor
      key={project.scene.id + ":" + project.storageRevision}
      source={source}
      initial={project}
      onOpen={setProject}
    />
  );
}

function Editor({
  source,
  initial,
  onOpen,
}: {
  source: Source;
  initial: OpenProject;
  onOpen: (project: OpenProject) => void;
}) {
  const { catalog, assets } = source;
  const [history, setHistory] = useState<HistoryState>({
      present: initial.scene,
      past: [],
      future: [],
    }),
    historyRef = useRef(history);
  const scene = history.present;
  const [selected, setSelected] = useState<string>(),
    [notice, setNotice] = useState(initial.warning ?? "");
  const [saveStatus, setSaveStatus] = useState<
    "saving" | "saved" | "dirty" | "conflict" | "error"
  >(initial.warning ? "error" : "saved");
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;
  const [mode, setMode] = useState<InputMode>("meaning"),
    [prompt, setPrompt] = useState("Сосредоточиться на главном");
  const [background, setBackground] = useState(true);
  const [busy, setBusy] = useState(false),
    [explanation, setExplanation] = useState("");
  const [candidates, setCandidates] = useState<SceneDocument[]>([]),
    [candidateRevision, setCandidateRevision] = useState(-1);
  const [libraryOpen, setLibraryOpen] = useState(false),
    [inspectorOpen, setInspectorOpen] = useState(false);
  const queue = useRef<SaveQueue | null>(null),
    jobs = useRef(new LatestJob()),
    generation = useRef(0),
    imports = useRef(0),
    fileInput = useRef<HTMLInputElement>(null);
  const firstSave = useRef(true);
  const selectedItem = scene.instances.find((item) => item.id === selected);

  useEffect(() => {
    const saver = new SaveQueue(
      (document, expected) => repository.save(document, expected),
      initial.storageRevision,
      (event) => {
        if (event.status === "conflict" || event.status === "error") {
          setSaveStatus(event.status);
          setNotice(event.error.message);
        } else if (event.status === "saved")
          setSaveStatus(
            event.documentRevision === historyRef.current.present.revision
              ? "saved"
              : "dirty",
          );
        else setSaveStatus("saving");
      },
    );
    queue.current = saver;
    return () => {
      saver.close();
      jobs.current.cancel();
      imports.current++;
    };
  }, []);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      if (initial.storageRevision > 0) return;
    }
    if (
      saveStatusRef.current === "conflict" ||
      saveStatusRef.current === "error"
    )
      return;
    setSaveStatus("dirty");
    const timer = setTimeout(() => queue.current?.submit(scene), 250);
    return () => clearTimeout(timer);
  }, [scene]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (saveStatusRef.current !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, []);
  useEffect(() => {
    if (selected && !scene.instances.some((item) => item.id === selected))
      setSelected(undefined);
  }, [scene.instances, selected]);

  function cancelGeneration() {
    generation.current++;
    jobs.current.cancel();
    setBusy(false);
  }
  function commit(next: SceneDocument) {
    try {
      const validated = validateScene(next, catalog);
      cancelGeneration();
      const updated = historyReducer(historyRef.current, {
        type: "commit",
        scene: validated,
      });
      historyRef.current = updated;
      setHistory(updated);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function travel(type: "undo" | "redo") {
    cancelGeneration();
    const updated = historyReducer(historyRef.current, { type });
    historyRef.current = updated;
    setHistory(updated);
  }
  function perform(action: () => void) {
    try {
      action();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  const changeSelected = (patch: Parameters<typeof changeObject>[2]) => {
    if (selected)
      commit(changeObject(historyRef.current.present, selected, patch));
  };
  const duplicate = () =>
    perform(() => {
      if (!selected) return;
      const next = duplicateObject(historyRef.current.present, selected);
      commit(next);
      setSelected(next.instances.at(-1)?.id);
    });
  const remove = () => {
    if (selected) {
      commit(deleteObject(historyRef.current.present, selected));
      setSelected(undefined);
    }
  };
  const layer = (id: string, direction: -1 | 1) =>
    commit(moveLayer(historyRef.current.present, id, direction));
  const add = (id: string) =>
    perform(() => {
      const next = addObject(historyRef.current.present, id, catalog);
      commit(next);
      setSelected(next.instances.at(-1)?.id);
    });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        document.querySelector("dialog[open]")
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
      } else if (modifier && event.key.toLowerCase() === "d" && selected) {
        event.preventDefault();
        duplicate();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selected
      ) {
        event.preventDefault();
        remove();
      } else if (
        selected &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const current = historyRef.current.present,
          item = current.instances.find((item) => item.id === selected);
        if (!item) return;
        const step = event.shiftKey ? 10 : 2;
        changeSelected({
          x:
            item.x +
            (event.key === "ArrowRight"
              ? step
              : event.key === "ArrowLeft"
                ? -step
                : 0) /
              current.width,
          y:
            item.y +
            (event.key === "ArrowDown"
              ? step
              : event.key === "ArrowUp"
                ? -step
                : 0) /
              current.height,
        });
      } else if (event.key === "Escape") setSelected(undefined);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [selected]);

  async function generate() {
    const token = ++generation.current,
      snapshot = clone(historyRef.current.present);
    setBusy(true);
    setNotice("");
    try {
      const selection = selectObjects(prompt, mode, catalog);
      const result = await jobs.current.run(
        snapshot.revision,
        () => historyRef.current.present.revision,
        async (signal) => {
          await yieldToPaint(signal);
          return makeCandidates(
            { ...snapshot, seed: (snapshot.seed + 1) >>> 0 },
            selection.ids,
            catalog,
            background,
          );
        },
      );
      if (!result || token !== generation.current) return;
      setCandidates(result);
      setExplanation(selection.explanation);
      if (!snapshot.instances.length) {
        commit(result[0]);
        setCandidateRevision(historyRef.current.present.revision);
        setBusy(false);
      } else setCandidateRevision(snapshot.revision);
    } catch (error) {
      if (token === generation.current) setNotice(errorMessage(error));
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function applyCandidate(candidate: SceneDocument) {
    if (candidateRevision !== historyRef.current.present.revision) {
      setNotice("Параметры изменены. Соберите варианты ещё раз.");
      return;
    }
    commit({ ...clone(candidate), id: scene.id, name: scene.name });
    setCandidateRevision(historyRef.current.present.revision);
    setSelected(undefined);
  }
  function saveProject() {
    downloadFile(
      JSON.stringify(clone(historyRef.current.present), null, 2),
      safeFileName(scene.name) + ".composition.json",
      "application/json",
    );
  }
  function exportSvg() {
    perform(() => {
      const snapshot = clone(historyRef.current.present),
        svg = exportScene(snapshot, catalog, assets);
      downloadFile(svg, safeFileName(snapshot.name) + ".svg", "image/svg+xml");
    });
  }
  async function importFile(file: File, kind: "palette" | "project") {
    const token = ++imports.current,
      snapshot = clone(historyRef.current.present);
    try {
      const maxBytes =
        kind === "palette" ? LIMITS.paletteBytes : LIMITS.projectBytes;
      if (file.size > maxBytes) throw new Error("Файл слишком большой.");
      const data = parseJsonFile(await file.text(), maxBytes);
      if (token !== imports.current) return;
      if (snapshot.revision !== historyRef.current.present.revision)
        throw new Error(
          "Проект изменился во время чтения файла. Загрузите файл ещё раз.",
        );
      if (kind === "palette") {
        commit({ ...snapshot, palette: parsePalette(data, catalog) });
        setNotice("Палитра применена ко всей композиции.");
      } else {
        const imported = validateScene(data, catalog);
        onOpen({
          scene: { ...imported, id: uid(), revision: 0 },
          storageRevision: 0,
        });
      }
    } catch (error) {
      if (token === imports.current) setNotice(errorMessage(error));
    }
  }
  function fork() {
    onOpen({
      scene: {
        ...clone(historyRef.current.present),
        id: uid(),
        name: scene.name + " — копия",
        revision: 0,
      },
      storageRevision: 0,
    });
  }
  async function openLatest() {
    try {
      const saved = await repository.get(scene.id);
      if (!saved)
        throw new Error("Сохранённая версия не найдена. Сохраните свою копию.");
      onOpen({
        scene: validateScene(saved.document, catalog),
        storageRevision: saved.storageRevision,
      });
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  const sidebar = (
    <Sidebar
      scene={scene}
      catalog={catalog}
      assets={assets}
      selected={selected}
      onSelect={setSelected}
      onAdd={add}
      onLayer={layer}
      mode={mode}
      setMode={(value) => {
        cancelGeneration();
        setMode(value);
      }}
      prompt={prompt}
      setPrompt={(value) => {
        cancelGeneration();
        setPrompt(value);
      }}
      background={background}
      setBackground={(value) => {
        cancelGeneration();
        setBackground(value);
      }}
      busy={busy}
      onGenerate={generate}
      onCancel={cancelGeneration}
      explanation={explanation}
    />
  );
  const inspector = (
    <Inspector
      scene={scene}
      catalog={catalog}
      selected={selectedItem}
      onChange={commit}
      onObjectChange={changeSelected}
      onDuplicate={duplicate}
      onDelete={remove}
      onLayer={(direction) => selected && layer(selected, direction)}
      onPaletteImport={(file) => void importFile(file, "palette")}
      onPaletteSample={() =>
        downloadFile(
          JSON.stringify(
            { name: "Моя палитра", colors: catalog.palettes[0].colors },
            null,
            2,
          ),
          "palette-example.json",
          "application/json",
        )
      }
    />
  );
  const statusText = {
    saved: "Сохранено в браузере",
    saving: "Сохраняем…",
    dirty: "Не сохранено",
    conflict: "Конфликт версий",
    error: "Хранилище недоступно",
  }[saveStatus];
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <a
          href="#"
          className="brand"
          aria-label="Композиция — векторная студия"
        >
          <span className="brand-mark">о.</span>
          <span>
            композиция<small>ВЕКТОРНАЯ СТУДИЯ</small>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-heading">
          <input
            aria-label="Название проекта"
            maxLength={100}
            value={scene.name}
            onChange={(event) =>
              commit({
                ...historyRef.current.present,
                name: event.target.value || "Новая композиция",
              })
            }
          />
          <span className={`save-status ${saveStatus}`} role="status">
            <i />
            {statusText}
          </span>
        </div>
        <div className="header-actions">
          <div className="history-buttons">
            <button
              className="icon-button"
              title="Отменить · Ctrl Z"
              aria-label="Отменить действие"
              disabled={!history.past.length}
              onClick={() => travel("undo")}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-button"
              title="Повторить · Ctrl Shift Z"
              aria-label="Повторить действие"
              disabled={!history.future.length}
              onClick={() => travel("redo")}
            >
              <ArrowRight size={18} />
            </button>
          </div>
          <details className="project-menu">
            <summary className="secondary">
              <FolderOpen size={16} />
              <span>Проект</span>
              <ChevronDown size={13} />
            </summary>
            <div className="menu-content">
              <button
                onClick={() =>
                  onOpen({ scene: blankScene(catalog), storageRevision: 0 })
                }
              >
                <Plus size={15} />
                Новая композиция
              </button>
              <button onClick={() => fileInput.current?.click()}>
                <Upload size={15} />
                Открыть файл проекта
              </button>
              <button onClick={saveProject}>
                <Download size={15} />
                Скачать проект JSON
              </button>
              <button onClick={fork}>
                <FolderOpen size={15} />
                Сохранить отдельно
              </button>
            </div>
          </details>
          <button
            className="primary export-button"
            onClick={exportSvg}
            disabled={!scene.instances.length}
          >
            <Download size={16} />
            <span>Скачать SVG</span>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file, "project");
            event.target.value = "";
          }}
        />
      </header>
      {(saveStatus === "conflict" || saveStatus === "error") && (
        <div className="storage-banner" role="alert">
          <span>
            {saveStatus === "conflict"
              ? "Проект обновлён в другой вкладке. Ваша версия сохранена в памяти."
              : "Автосохранение недоступно. Скачайте проект, чтобы не потерять работу."}
          </span>
          <button onClick={fork}>Сохранить отдельно</button>
          {saveStatus === "conflict" && (
            <button onClick={() => void openLatest()}>
              Открыть актуальную
            </button>
          )}
          <button onClick={saveProject}>Скачать проект</button>
        </div>
      )}
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Закрыть сообщение"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="mobile-toolbar">
        <button className="secondary" onClick={() => setLibraryOpen(true)}>
          <Menu size={16} />
          Сборка и объекты
        </button>
        <button className="secondary" onClick={() => setInspectorOpen(true)}>
          <SlidersHorizontal size={16} />
          Параметры
        </button>
      </div>
      <div className="studio-body">
        <aside className="left-sidebar">{sidebar}</aside>
        <main className="studio-main">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">ВАША КОМПОЗИЦИЯ</span>
              <h2>
                История в деталях<span>✳</span>
              </h2>
            </div>
            <span className="object-count">
              {scene.instances.length} / {LIMITS.instances} объектов
            </span>
          </div>
          <Canvas
            scene={scene}
            catalog={catalog}
            assets={assets}
            selected={selected}
            onSelect={setSelected}
            onMove={(id, x, y) =>
              commit(changeObject(historyRef.current.present, id, { x, y }))
            }
          />
          <Candidates
            candidates={candidates}
            catalog={catalog}
            assets={assets}
            onApply={applyCandidate}
            disabled={candidateRevision !== scene.revision}
            busy={busy}
          />
          <footer className="workspace-footer">
            <span>
              <Check size={12} />
              Только оригинальные объекты
            </span>
            <span>
              SVG · {scene.detail} · {catalog.families.length} объектов
            </span>
          </footer>
        </main>
        <aside className="right-sidebar">{inspector}</aside>
      </div>
      <Modal
        title="Сборка и библиотека"
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
      >
        {sidebar}
      </Modal>
      <Modal
        title="Параметры композиции"
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      >
        {inspector}
      </Modal>
    </div>
  );
}
