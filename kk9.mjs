// ============================================================
// КК9 — Главный файл системы (точка входа)
// Этот файл указан в system.json как "esmodules": ["module/kk9.mjs"]
// Foundry загружает его первым при старте игры.
// ============================================================

// Импортируем наши модули
import { FACULTIES } from "./module/faculties.mjs";

import {
  CharacterDataModel,
  NpcLightDataModel,
  NpcHardDataModel,
  NpcBossDataModel,
  ArtifactDataModel,
  SpellDataModel,
  DemonDataModel,
  AbilityDataModel,
  CompanionDataModel
} from "./module/data-models.mjs";

import { KK9Actor } from "./module/documents.mjs";
import { KK9Item }  from "./module/documents.mjs";

import {
  KK9CharacterSheet,
  KK9NpcLightSheet,
  KK9NpcHardSheet,
  KK9NpcBossSheet,
  KK9ItemSheet
} from "./module/sheets.mjs";

// ============================================================
// Хук "init" — запускается при инициализации Foundry.
// Здесь регистрируем все наши классы и настройки.
// ============================================================
Hooks.once("init", function () {
  console.log("КК9 | Инициализация системы Кризисного Комитета №9");

  // --- Регистрируем наши кастомные классы документов ---
  // Это говорит Foundry: "когда создаёшь Actor — используй наш класс KK9Actor"
  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass = KK9Item;

  // --- Регистрируем дата-модели для каждого типа ---
  // Теперь Foundry знает какие поля есть у каждого типа актёра и предмета
  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light":  NpcLightDataModel,
    "npc-hard":   NpcHardDataModel,
    "npc-boss":   NpcBossDataModel
  };

  CONFIG.Item.dataModels = {
    "artifact":  ArtifactDataModel,
    "spell":     SpellDataModel,
    "demon":     DemonDataModel,
    "ability":   AbilityDataModel,
    "companion": CompanionDataModel
  };

  // --- Регистрируем листы (окна карточек) ---
  // Сначала убираем стандартные листы Foundry, затем добавляем наши

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("kk9", KK9CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "КК9 | Лист персонажа"
  });
  Actors.registerSheet("kk9", KK9NpcLightSheet, {
    types: ["npc-light"],
    makeDefault: true,
    label: "КК9 | НПС (лёгкий)"
  });
  Actors.registerSheet("kk9", KK9NpcHardSheet, {
    types: ["npc-hard"],
    makeDefault: true,
    label: "КК9 | НПС (сложный)"
  });
  Actors.registerSheet("kk9", KK9NpcBossSheet, {
    types: ["npc-boss"],
    makeDefault: true,
    label: "КК9 | Босс / непобедимый"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("kk9", KK9ItemSheet, {
    makeDefault: true,
    label: "КК9 | Лист предмета"
  });

  // --- Регистрируем вспомогательные функции для шаблонов Handlebars ---
  // Handlebars — это язык шаблонов для .hbs файлов
  _registerHandlebarsHelpers();

  // --- Предзагружаем шаблоны для скорости ---
  _preloadTemplates();

  console.log("КК9 | Инициализация завершена ✓");
});

// ============================================================
// Хук "ready" — запускается когда всё загружено и игра готова
// ============================================================
Hooks.once("ready", function () {
  console.log("КК9 | Система готова к игре!");
});

// ============================================================
// Вспомогательные функции Handlebars
// Используются в .hbs шаблонах как {{times 3}} или {{eq a b}}
// ============================================================
function _registerHandlebarsHelpers() {

  // {{eq a b}} — проверка равенства (для if/else в шаблонах)
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // {{ne a b}} — проверка неравенства
  Handlebars.registerHelper("ne", (a, b) => a !== b);

  // {{gt a b}} — больше чем
  Handlebars.registerHelper("gt", (a, b) => a > b);

  // {{lt a b}} — меньше чем
  Handlebars.registerHelper("lt", (a, b) => a < b);

  // {{times n}} — повторить блок n раз (для пипов здоровья)
  Handlebars.registerHelper("times", function (n, block) {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += block.fn(i);
    }
    return result;
  });

  // {{add a b}} — сложение
  Handlebars.registerHelper("add", (a, b) => a + b);

  // {{healthLabel value}} — название степени урона по числу
  Handlebars.registerHelper("healthLabel", (value) => {
    const labels = ["Здоров", "Царапина", "Ранен", "Тяжело ранен", "Критически", "Без сознания"];
    return labels[value] || "Здоров";
  });

  // {{dieLabel die}} — показывает "d6", "d8" и т.д.
  Handlebars.registerHelper("dieLabel", (die) => `d${die}`);

  // {{relationStatusLabel status}} — локализованный статус связи
  Handlebars.registerHelper("relationStatusLabel", (status) => {
    const map = { ally: "Союзник", enemy: "Враг", neutral: "Нейтрал", unknown: "Неизвестно" };
    return map[status] || status;
  });

  // {{relationStatusIcon status}} — иконка статуса связи
  Handlebars.registerHelper("relationStatusIcon", (status) => {
    const map = { ally: "👥", enemy: "⚔️", neutral: "🤝", unknown: "❓" };
    return map[status] || "❓";
  });

  // {{levelStars level}} — звёздочки для уровня отношений (-5 до +5)
  Handlebars.registerHelper("levelStars", (level) => {
    if (level > 0) return "★".repeat(level);
    if (level < 0) return "☆".repeat(Math.abs(level));
    return "○";
  });
}

// ============================================================
// Предзагрузка шаблонов
// Ускоряет открытие карточек — шаблоны кешируются заранее
// ============================================================
async function _preloadTemplates() {
  const templates = [
    // Актёры
    "systems/kk9/templates/actors/character-sheet.hbs",
    "systems/kk9/templates/actors/npc-light-sheet.hbs",
    "systems/kk9/templates/actors/npc-hard-sheet.hbs",
    "systems/kk9/templates/actors/npc-boss-sheet.hbs",
    // Части шаблонов (partials)
    "systems/kk9/templates/actors/parts/attributes.hbs",
    "systems/kk9/templates/actors/parts/skills.hbs",
    "systems/kk9/templates/actors/parts/health.hbs",
    "systems/kk9/templates/actors/parts/relations.hbs",
    "systems/kk9/templates/actors/parts/items.hbs",
    // Предметы
    "systems/kk9/templates/items/artifact-sheet.hbs",
    "systems/kk9/templates/items/spell-sheet.hbs",
    "systems/kk9/templates/items/demon-sheet.hbs",
    "systems/kk9/templates/items/ability-sheet.hbs",
    "systems/kk9/templates/items/companion-sheet.hbs"
  ];
  return loadTemplates(templates);
}
