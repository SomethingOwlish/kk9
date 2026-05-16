// ============================================================
// КК9 — Главный файл v0.4
// ============================================================

import { FACULTIES } from "./module/faculties.mjs";

import {
  CharacterDataModel, NpcLightDataModel, NpcHardDataModel, NpcBossDataModel,
  ArtifactDataModel, SpellDataModel, DemonDataModel, AbilityDataModel,
  CompanionDataModel, LanguageDataModel
} from "./module/data-models.mjs";

import { KK9Actor, KK9Item } from "./module/documents.mjs";

import {
  KK9CharacterSheet, KK9NpcLightSheet, KK9NpcHardSheet,
  KK9NpcBossSheet, KK9ItemSheet
} from "./module/sheets.mjs";

Hooks.once("init", function () {
  console.log("КК9 | Инициализация v0.4");

  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass  = KK9Item;

  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light": NpcLightDataModel,
    "npc-hard":  NpcHardDataModel,
    "npc-boss":  NpcBossDataModel
  };

  CONFIG.Item.dataModels = {
    "artifact":  ArtifactDataModel,
    "spell":     SpellDataModel,
    "demon":     DemonDataModel,
    "ability":   AbilityDataModel,
    "companion": CompanionDataModel,
    "language":  LanguageDataModel
  };

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("kk9", KK9CharacterSheet, { types:["character"], makeDefault:true, label:"КК9 | Персонаж" });
  Actors.registerSheet("kk9", KK9NpcLightSheet,  { types:["npc-light"], makeDefault:true, label:"КК9 | НПС лёгкий" });
  Actors.registerSheet("kk9", KK9NpcHardSheet,   { types:["npc-hard"],  makeDefault:true, label:"КК9 | НПС сложный" });
  Actors.registerSheet("kk9", KK9NpcBossSheet,   { types:["npc-boss"],  makeDefault:true, label:"КК9 | Босс" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("kk9", KK9ItemSheet, { makeDefault:true, label:"КК9 | Предмет" });

  _registerHelpers();
  _preloadTemplates();

  console.log("КК9 | Готово ✓");
});

function _registerHelpers() {
  Handlebars.registerHelper("eq",  (a, b) => a === b);
  Handlebars.registerHelper("ne",  (a, b) => a !== b);
  Handlebars.registerHelper("gt",  (a, b) => a > b);
  Handlebars.registerHelper("lt",  (a, b) => a < b);
  Handlebars.registerHelper("gte", (a, b) => a >= b);
  Handlebars.registerHelper("add", (a, b) => a + b);

  Handlebars.registerHelper("times", function(n, block) {
    let r = "";
    for (let i = 0; i < n; i++) r += block.fn(i + 1);
    return r;
  });

  Handlebars.registerHelper("healthLabel", (v) => {
    return ["Здоров","Царапина","Ранен","Тяжело ранен","Критически","Без сознания"][v] || "Здоров";
  });

  Handlebars.registerHelper("mentalLabel", (v) => {
    return ["Стабилен","Тревога","Потрясён","Сломлен","Кризис","Диссоциация"][v] || "Стабилен";
  });

  Handlebars.registerHelper("talentLabel", (v) => {
    return { weak:"Слабо", strong:"Крепко", exceptional:"Небывалый талант" }[v] || v;
  });

  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key] ?? key);

  Handlebars.registerHelper("facultyColor", (key) => {
    const colors = {
      white:"#e8e8e8", black:"#888", blue:"#3b82f6", green:"#22c55e",
      purple:"#a855f7", red:"#ef4444", brown:"#92400e",
      mercury:"#94a3b8", invisible:"#6b7280"
    };
    return colors[key] || "#c9a84c";
  });
}

async function _preloadTemplates() {
  return loadTemplates([
    "systems/kk9/templates/actors/character-sheet.hbs",
    "systems/kk9/templates/actors/npc-light-sheet.hbs",
    "systems/kk9/templates/actors/npc-hard-sheet.hbs",
    "systems/kk9/templates/actors/npc-boss-sheet.hbs",
    "systems/kk9/templates/actors/parts/attributes.hbs",
    "systems/kk9/templates/actors/parts/skills.hbs",
    "systems/kk9/templates/actors/parts/health.hbs",
    "systems/kk9/templates/actors/parts/relations.hbs",
    "systems/kk9/templates/actors/parts/items.hbs",
    "systems/kk9/templates/actors/parts/biography.hbs",
    "systems/kk9/templates/items/artifact-sheet.hbs",
    "systems/kk9/templates/items/spell-sheet.hbs",
    "systems/kk9/templates/items/demon-sheet.hbs",
    "systems/kk9/templates/items/ability-sheet.hbs",
    "systems/kk9/templates/items/companion-sheet.hbs",
    "systems/kk9/templates/items/language-sheet.hbs"
  ]);
}
