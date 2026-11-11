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
const themes: {
  words: string[];
  tags: string[];
  name: string;
  preferred: string[];
}[] = [
  {
    words: [
      "финанс*",
      "деньг*",
      "денег",
      "денеж*",
      "бюджет*",
      "накоп*",
      "сбережен*",
      "покуп*",
      "инвест*",
    ],
    tags: ["finance", "time", "communication"],
    name: "деньги и планирование",
    preferred: ["wallet", "coin", "phone"],
  },
  {
    words: ["фокус*", "сосредоточ*", "главном", "тишин*", "концентрац*"],
    tags: ["focus", "study", "time"],
    name: "фокус и спокойная работа",
    preferred: ["headphones", "book", "phone"],
  },
  {
    words: [
      "учеб*",
      "обучен*",
      "знани*",
      "читать",
      "чтени*",
      "изуч*",
      "учит*",
      "учусь",
      "учимся",
    ],
    tags: ["study", "ideas", "work"],
    name: "обучение и знания",
    preferred: ["book", "pen", "lamp"],
  },
  {
    words: ["идея", "идеи", "идею", "идее", "идеей", "идей*", "идеям*", "идеях", "творч*", "вдохнов*", "решени*", "смысл*", "проект*"],
    tags: ["ideas", "work", "study"],
    name: "идеи и поиск решений",
    preferred: ["lamp", "puzzle", "pen"],
  },
  {
    words: ["врем*", "дедлайн*", "успев*", "план", "планы", "плана", "плану", "планом", "плане", "планов", "планир*", "продуктив*", "организа*", "организо*"],
    tags: ["time", "work", "study"],
    name: "время и организация",
    preferred: ["folder", "phone", "pen"],
  },
  {
    words: ["связ*", "общен*", "цифров*", "коммуника*", "онлайн", "контакт*"],
    tags: ["communication", "focus", "ideas"],
    name: "общение и цифровая среда",
    preferred: ["phone", "headphones", "puzzle"],
  },
  {
    words: ["уют*", "дом", "дома", "дому", "домом", "доме", "домашн*", "баланс*", "отдых*", "настроен*", "комфорт*"],
    tags: ["calm", "focus", "study"],
    name: "уют и баланс",
    preferred: ["flowers", "headphones", "book"],
  },
  {
    words: ["работ*", "задач*", "офис*", "начать", "дела", "дело", "делами", "делах"],
    tags: ["work", "time", "ideas"],
    name: "работа и повседневные задачи",
    preferred: ["folder", "pen", "lamp"],
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
      new RegExp(
        `(?<![\\p{L}\\p{N}])${normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
        "u",
      ).test(text),
    ),
  );
  if (direct.length > 6)
    throw new StudioError(
      "В заголовке упомянуто больше 6 объектов. Сократите набор или добавьте остальные вручную.",
    );
  const words = [...new Set(text.match(/[\p{L}\p{N}]+/gu) ?? [])];
  // Match complete words or explicitly declared word prefixes. A fragment in
  // the middle of an unrelated word is never evidence for a semantic theme.
  const ranked = themes
    .map((item) => ({
      ...item,
      score: words.reduce((score, word) => score + (
        item.words.some((term) => term.endsWith("*")
          ? word.startsWith(term.slice(0, -1)) : word === term)
          // Time is often framing ("время для …"), rather than the subject.
          ? word.startsWith("врем") ? 0.5 : 1
          : 0
      ), 0),
    }))
    .sort((a, b) => b.score - a.score);
  const theme = ranked[0];
  if ((theme.score || direct.length) && words.some((word) =>
    ["не", "без", "ни", "нельзя", "ничего", "никаких", "никакой"].includes(word)))
    throw new StudioError(
      "В запросе есть отрицание. Уточните тему без исключений или выберите нужные объекты.",
    );
  if (theme.score && theme.score === ranked[1].score)
    throw new StudioError(
      "Нашёл несколько равнозначных тем. Уточните главную тему или выберите нужные объекты.",
    );
  if (!direct.length && !theme.score)
    throw new StudioError(
      "Пока не нашёл подходящий смысл в этой библиотеке. Уточните тему или переключитесь на выбор объектов.",
    );
  const selected = [...direct.map((item) => item.id)];
  if (theme.score)
    for (const id of theme.preferred) {
      if (
        selected.length < 3 &&
        !selected.includes(id) &&
        catalog.families.some((family) => family.id === id)
      )
        selected.push(id);
    }
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
