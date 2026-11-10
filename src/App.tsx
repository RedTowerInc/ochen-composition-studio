import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
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
import { makeCandidates, resizeScene } from "./core/composition";
import { historyReducer } from "./core/history";
import { LatestJob, yieldToPaint } from "./core/jobs";
import {
  activeProjectId,
  ConflictError,
  ProjectRepository,
  rememberProject,
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
import { RenderBoundary } from "./components/RenderBoundary";

const repository = new ProjectRepository();
type Source = { catalog: Catalog; assets: AssetStore };
type OpenProject = {
  scene: SceneDocument;
  storageRevision: number;
  warning?: string;
  info?: string;
};
const withSelection = (project: OpenProject): OpenProject => ({
  ...project,
  info: rememberProject(project.scene.id)
    ? project.info
    : "Выбор проекта не запоминается в этой вкладке. Проекты доступны в списке сохранённых; для переноса скачайте JSON.",
});
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
          const preferred = activeProjectId();
          saved = await Promise.race([
            preferred
              ? repository
                  .get(preferred)
                  .then((record) => record ?? repository.latest())
              : repository.latest(),
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
        setProject(
          withSelection({
            scene: saved?.document ?? blankScene(loaded.catalog),
            storageRevision: saved?.storageRevision ?? 0,
            warning,
          }),
        );
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
      onOpen={(next) => setProject(withSelection(next))}
      onReloadAssets={async (snapshot) => {
        const loaded = await loadCatalog(
          new AbortController().signal,
          () => {},
        );
        validateScene(snapshot, loaded.catalog);
        setSource(loaded);
      }}
    />
  );
}

function Editor({
  source,
  initial,
  onOpen,
  onReloadAssets,
}: {
  source: Source;
  initial: OpenProject;
  onOpen: (project: OpenProject) => void;
  onReloadAssets: (snapshot: SceneDocument) => Promise<void>;
}) {
  const { catalog, assets } = source;
  const [history, setHistory] = useState<HistoryState>({
      present: initial.scene,
      past: [],
      future: [],
    }),
    historyRef = useRef(history);
  const scene = history.present;
  const [nameDraft, setNameDraft] = useState(scene.name);
  const nameDraftRef = useRef(scene.name),
    nameDirtyRef = useRef(false);
  useEffect(() => {
    nameDraftRef.current = scene.name;
    nameDirtyRef.current = false;
    setNameDraft(scene.name);
  }, [scene.name]);
  const [selected, setSelected] = useState<string>(),
    [notice, setNotice] = useState(initial.warning ?? initial.info ?? "");
  const [saveStatus, setSaveStatus] = useState<
    "saving" | "saved" | "dirty" | "conflict" | "error"
  >(
    initial.warning ? "error" : initial.storageRevision > 0 ? "saved" : "dirty",
  );
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
  const inputVersion = useRef(0),
    candidateInputVersion = useRef(-1);
  const inputValues = useRef({ mode, prompt, background });
  const locked = useRef(false),
    transitionEpoch = useRef(0);
  const [transitioning, setTransitioning] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedDocument[]>([]),
    [projectsOpen, setProjectsOpen] = useState(false);
  type TransitionMode = "current" | "copy";
  const [pendingOpen, setPendingOpen] = useState<{
    target: OpenProject;
    mode: TransitionMode;
    message: string;
  }>();
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
      initial.storageRevision > 0
        ? { id: initial.scene.id, revision: initial.scene.revision }
        : undefined,
    );
    queue.current = saver;
    return () => {
      saver.close();
      jobs.current.cancel();
      imports.current++;
      transitionEpoch.current++;
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
      if (saveStatusRef.current !== "saved" || nameDirtyRef.current) {
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
  function invalidateInput() {
    inputVersion.current++;
    cancelGeneration();
    setCandidates([]);
    setCandidateRevision(-1);
    setExplanation("");
  }
  function commit(next: SceneDocument) {
    if (locked.current) return false;
    try {
      const validated = validateScene(next, catalog);
      cancelGeneration();
      const updated = historyReducer(historyRef.current, {
        type: "commit",
        scene: validated,
      });
      historyRef.current = updated;
      setHistory(updated);
      return true;
    } catch (error) {
      setNotice(errorMessage(error));
      return false;
    }
  }
  function confirmName() {
    const name = nameDraftRef.current.trim() || "Новая композиция";
    const current = historyRef.current.present;
    if (name !== current.name && !commit({ ...current, name })) return false;
    nameDraftRef.current = name;
    nameDirtyRef.current = false;
    setNameDraft(name);
    return true;
  }
  function changeComposition(next: SceneDocument) {
    // A blur may have committed a title since this inspector was rendered.
    // Apply only the requested properties to the latest scene.
    const current = historyRef.current.present;
    let updated = current;
    if (next.width !== scene.width || next.height !== scene.height)
      updated = resizeScene(updated, next.width, next.height);
    if (next.detail !== scene.detail)
      updated = { ...updated, detail: next.detail };
    if (next.palette !== scene.palette)
      updated = { ...updated, palette: next.palette };
    commit(updated);
  }
  function travel(type: "undo" | "redo") {
    if (locked.current) return;
    cancelGeneration();
    const updated = historyReducer(historyRef.current, { type });
    historyRef.current = updated;
    nameDraftRef.current = updated.present.name;
    nameDirtyRef.current = false;
    setNameDraft(updated.present.name);
    setHistory(updated);
  }
  function perform(action: () => void) {
    try {
      action();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function requestOpen(
    target: OpenProject,
    mode: TransitionMode = "current",
    retry = false,
  ) {
    if (locked.current) return;
    if (!confirmName()) return;
    locked.current = true;
    setTransitioning(true);
    setPendingOpen(undefined);
    cancelGeneration();
    imports.current++;
    const epoch = ++transitionEpoch.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = clone(historyRef.current.present);
      const operation =
        mode === "copy"
          ? (async () => {
              const existing = await repository.get(target.scene.id);
              if (existing) {
                if (
                  JSON.stringify(existing.document) !==
                  JSON.stringify(target.scene)
                )
                  throw new ConflictError();
                return existing.storageRevision;
              }
              return repository.save(target.scene, 0);
            })()
          : queue
              .current!.flush(snapshot, retry)
              .then(() => target.storageRevision);
      const storageRevision = await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Хранилище отвечает слишком долго. Работа остаётся открытой. Можно повторить переход или скачать проект.",
                ),
              ),
            5000,
          );
        }),
      ]);
      if (epoch !== transitionEpoch.current) return;
      queue.current?.close();
      onOpen({ ...target, storageRevision });
    } catch (error) {
      if (epoch === transitionEpoch.current)
        setPendingOpen({ target, mode, message: errorMessage(error) });
    } finally {
      if (timer) clearTimeout(timer);
      if (epoch === transitionEpoch.current) {
        locked.current = false;
        setTransitioning(false);
      }
    }
  }
  async function showSavedProjects() {
    if (!confirmName()) return;
    try {
      setSavedProjects(await repository.list());
      setProjectsOpen(true);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function openSaved(id: string) {
    // Selecting the current document must not replace its newer in-memory
    // revision with the older snapshot captured by the project picker.
    if (id === historyRef.current.present.id) {
      setProjectsOpen(false);
      return;
    }
    try {
      const saved = await repository.get(id);
      if (!saved) throw new Error("Проект больше не найден в этом браузере.");
      const document = validateScene(saved.document, catalog);
      setProjectsOpen(false);
      await requestOpen({
        scene: document,
        storageRevision: saved.storageRevision,
      });
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
    if (locked.current) return;
    if (!confirmName()) return;
    const requestVersion = inputVersion.current;
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
      candidateInputVersion.current = requestVersion;
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
    if (
      candidateRevision !== historyRef.current.present.revision ||
      candidateInputVersion.current !== inputVersion.current
    ) {
      setNotice("Параметры изменены. Соберите варианты ещё раз.");
      return;
    }
    commit({ ...clone(candidate), id: scene.id, name: scene.name });
    setCandidateRevision(historyRef.current.present.revision);
    setSelected(undefined);
  }
  function saveProject() {
    confirmName();
    const snapshot = clone(historyRef.current.present);
    downloadFile(
      JSON.stringify(snapshot, null, 2),
      safeFileName(snapshot.name) + ".composition.json",
      "application/json",
    );
  }
  function exportSvg() {
    confirmName();
    perform(() => {
      const snapshot = clone(historyRef.current.present),
        svg = exportScene(snapshot, catalog, assets);
      downloadFile(svg, safeFileName(snapshot.name) + ".svg", "image/svg+xml");
    });
  }
  async function importFile(file: File, kind: "palette" | "project") {
    if (locked.current) return;
    if (!confirmName()) return;
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
        await requestOpen({
          scene: { ...imported, id: uid(), revision: 0 },
          storageRevision: 0,
        });
      }
    } catch (error) {
      if (token === imports.current) setNotice(errorMessage(error));
    }
  }
  function fork() {
    if (!confirmName()) return;
    const current = historyRef.current.present;
    void requestOpen(
      {
        scene: {
          ...clone(current),
          id: uid(),
          name: current.name.slice(0, 92) + " — копия",
          revision: 0,
        },
        storageRevision: 0,
      },
      "copy",
    );
  }
  async function openLatest() {
    if (!confirmName()) return;
    try {
      const saved = await repository.get(scene.id);
      if (!saved)
        throw new Error("Сохранённая версия не найдена. Сохраните свою копию.");
      setPendingOpen({
        target: {
          scene: validateScene(saved.document, catalog),
          storageRevision: saved.storageRevision,
        },
        mode: "current",
        message:
          "Открытие актуальной версии заменит ваши изменения в памяти. Сначала можно скачать проект или сохранить отдельную копию.",
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
        if (value === inputValues.current.mode) return;
        inputValues.current.mode = value;
        invalidateInput();
        setMode(value);
      }}
      prompt={prompt}
      setPrompt={(value) => {
        if (value === inputValues.current.prompt) return;
        inputValues.current.prompt = value;
        invalidateInput();
        setPrompt(value);
      }}
      background={background}
      setBackground={(value) => {
        if (value === inputValues.current.background) return;
        inputValues.current.background = value;
        invalidateInput();
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
      onChange={changeComposition}
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
  const visibleSaveStatus =
    nameDraft !== scene.name &&
    saveStatus !== "error" &&
    saveStatus !== "conflict"
      ? "dirty"
      : saveStatus;
  const statusText = {
    saved: "Сохранено в браузере",
    saving: "Сохраняем…",
    dirty: "Не сохранено",
    conflict: "Конфликт версий",
    error: "Хранилище недоступно",
  }[visibleSaveStatus];
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
            disabled={transitioning}
            value={nameDraft}
            onChange={(event) => {
              nameDraftRef.current = event.target.value;
              nameDirtyRef.current =
                event.target.value !== historyRef.current.present.name;
              setNameDraft(event.target.value);
            }}
            onBlur={confirmName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                confirmName();
                event.currentTarget.blur();
              }
              if (event.key === "Escape") {
                const current = historyRef.current.present.name;
                nameDraftRef.current = current;
                nameDirtyRef.current = false;
                setNameDraft(current);
                event.currentTarget.blur();
              }
            }}
          />
          <span className={`save-status ${visibleSaveStatus}`} role="status">
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
              <button className="mobile-history-action" disabled={!history.past.length} onClick={() => travel("undo")}>
                Отменить действие
              </button>
              <button className="mobile-history-action" disabled={!history.future.length} onClick={() => travel("redo")}>
                Повторить действие
              </button>
              <button
                disabled={transitioning}
                onClick={() =>
                  void requestOpen({
                    scene: blankScene(catalog),
                    storageRevision: 0,
                  })
                }
              >
                <Plus size={15} />
                Новая композиция
              </button>
              <button
                disabled={transitioning}
                onClick={() => void showSavedProjects()}
              >
                <FolderOpen size={15} />
                Открыть сохранённый проект
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
      {transitioning && (
        <div className="notice" role="status">
          <LoaderCircle size={15} className="spin" /> Сохраняем текущий проект
          перед переходом…
        </div>
      )}
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
      <RenderBoundary
        onDownload={saveProject}
        onReload={() => onReloadAssets(clone(historyRef.current.present))}
      >
        <div
          className="studio-body"
          inert={transitioning}
          aria-busy={transitioning}
        >
          <aside className="left-sidebar">{sidebar}</aside>
          <main className="studio-main">
            <div className="workspace-heading">
              <div>
                <h2>Композиция</h2>
              </div>
              <span className="object-count">
                {scene.instances.length} / {LIMITS.instances} объектов
              </span>
            </div>
            <Canvas
              interactionDisabled={transitioning}
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
              disabled={
                candidateRevision !== scene.revision ||
                candidateInputVersion.current !== inputVersion.current
              }
              busy={busy}
            />
          </main>
          <aside className="right-sidebar">{inspector}</aside>
        </div>
      </RenderBoundary>
      <Modal
        title="Сборка и библиотека"
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
      >
        <RenderBoundary
          onDownload={saveProject}
          onReload={() => onReloadAssets(clone(historyRef.current.present))}
        >
          {sidebar}
        </RenderBoundary>
      </Modal>
      <Modal
        title="Параметры композиции"
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      >
        {inspector}
      </Modal>
      <Modal
        title="Сохранённые проекты"
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
      >
        <div className="saved-projects">
          {!savedProjects.length && (
            <p>В этом браузере пока нет сохранённых проектов.</p>
          )}
          {savedProjects
            .filter((item) => typeof item.id === "string")
            .map((item) => (
              <button
                className="saved-project"
                key={item.id}
                onClick={() => void openSaved(item.id)}
              >
                <strong>
                  {typeof item.document?.name === "string"
                    ? item.document.name
                    : "Повреждённый проект"}
                </strong>
                <small>
                  {Array.isArray(item.document?.instances)
                    ? item.document.instances.length
                    : "?"}{" "}
                  объектов ·{" "}
                  {Number.isFinite(item.updatedAt)
                    ? new Date(item.updatedAt).toLocaleString("ru-RU")
                    : "Дата недоступна"}
                </small>
              </button>
            ))}
        </div>
      </Modal>
      <Modal
        title="Текущий проект остаётся открыт"
        open={!!pendingOpen}
        onClose={() => setPendingOpen(undefined)}
      >
        <div className="leave-project">
          <p>{pendingOpen?.message}</p>
          <p>
            Переход без сохранения может потерять ваши последние изменения.
            Скачивание файла само по себе не закрывает проект.
          </p>
          <button
            className="primary"
            onClick={() =>
              pendingOpen &&
              void requestOpen(pendingOpen.target, pendingOpen.mode, true)
            }
          >
            Повторить сохранение
          </button>
          <button className="secondary" onClick={saveProject}>
            Скачать проект JSON
          </button>
          <button className="secondary" onClick={fork}>
            Сохранить отдельную копию
          </button>
          <button
            className="text-button"
            onClick={() => setPendingOpen(undefined)}
          >
            Остаться в редакторе
          </button>
          <button
            className="text-button danger"
            onClick={() => {
              if (!pendingOpen) return;
              cancelGeneration();
              imports.current++;
              queue.current?.close();
              onOpen(pendingOpen.target);
            }}
          >
            Продолжить без сохранения
          </button>
        </div>
      </Modal>
    </div>
  );
}
