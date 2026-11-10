import { LIMITS, StudioError, type Catalog } from "./types";

export type InputMode = "meaning" | "objects";
export interface SelectionResult {
  ids: string[];
  explanation: string;
  unknown: string[];
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[«»"'.!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const themes = [
  {
    words: [
      "финанс",
      "деньг",
      "бюджет",
      "накоп",
      "сбережен",
      "покуп",
      "инвест",
    ],
    tags: ["finance", "time", "communication"],
    name: "деньги и планирование",
  },
  {
    words: ["фокус", "сосредоточ", "главном", "тишин", "концентрац"],
    tags: ["focus", "study", "time"],
    name: "фокус и спокойная работа",
  },
  {
    words: [
      "учеб",
      "учеба",
      "обучен",
      "знани",
      "читать",
      "чтени",
      "изуч",
      "учит",
      "учить",
      "учиться",
    ],
    tags: ["study", "ideas", "work"],
    name: "обучение и знания",
  },
  {
    words: ["иде", "творч", "вдохнов", "решени", "смысл", "проект"],
    tags: ["ideas", "work", "study"],
    name: "идеи и поиск решений",
  },
  {
    words: ["врем", "дедлайн", "успев", "план", "продуктив", "организ"],
    tags: ["time", "work", "study"],
    name: "время и организация",
  },
  {
    words: ["связ", "общен", "цифров", "коммуника", "онлайн", "контакт"],
    tags: ["communication", "focus", "ideas"],
    name: "общение и цифровая среда",
  },
  {
    words: ["уют", "дом", "баланс", "отдых", "настроен", "комфорт"],
    tags: ["calm", "focus", "study"],
    name: "уют и баланс",
  },
  {
    words: ["работ", "задач", "офис", "начать", "дела", "дело"],
    tags: ["work", "time", "ideas"],
    name: "работа и повседневные задачи",
  },
];

export function selectObjects(
  prompt: string,
  mode: InputMode,
  catalog: Catalog,
): SelectionResult {
  if (!prompt.trim())
    throw new StudioError("Добавьте заголовок или названия объектов.");
  if (prompt.length > LIMITS.prompt)
    throw new StudioError(`Введите до ${LIMITS.prompt} символов.`);
  const text = normalize(prompt);
  if (mode === "objects") {
    const tokens = prompt
      .split(/[,;\n]+/)
      .map(normalize)
      .filter(Boolean);
    const ids: string[] = [],
      unknown: string[] = [];
    for (const token of tokens) {
      const match = catalog.families.find((family) =>
        [family.name, family.id, ...family.aliases].some(
          (alias) => normalize(alias) === token,
        ),
      );
      if (match) ids.push(match.id);
      else unknown.push(token);
    }
    if (unknown.length)
      throw new StudioError(
        "Не найдены объекты: " +
          unknown.join(", ") +
          ". Выберите название из библиотеки.",
      );
    if (!ids.length)
      throw new StudioError("Перечислите объекты через запятую.");
    if (ids.length > 6)
      throw new StudioError(
        "Для автосборки выберите до 6 объектов. Остальные можно добавить вручную.",
      );
    return {
      ids,
      unknown,
      explanation: "Использованы указанные вами объекты.",
    };
  }
  const direct = catalog.families.filter((family) =>
    [family.name, ...family.aliases].some((alias) =>
      text.includes(normalize(alias)),
    ),
  );
  const theme = themes
    .map((item) => ({
      ...item,
      score: item.words.filter((word) => text.includes(word)).length,
    }))
    .sort((a, b) => b.score - a.score)[0];
  if (!direct.length && !theme.score)
    throw new StudioError(
      "Пока не нашёл подходящий смысл в этой библиотеке. Уточните тему или переключитесь на выбор объектов.",
    );
  const selected = [...direct.map((item) => item.id)];
  if (theme.score)
    for (const tag of theme.tags) {
      const match = catalog.families.find(
        (family) => family.tags.includes(tag) && !selected.includes(family.id),
      );
      if (match && selected.length < 3) selected.push(match.id);
    }
  return {
    ids: selected.slice(0, 6),
    unknown: [],
    explanation: theme.score
      ? `Подбор по теме «${theme.name}». Каждый объект можно заменить или удалить.`
      : "Подобраны объекты, упомянутые в заголовке.",
  };
}
