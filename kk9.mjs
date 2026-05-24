// ============================================================
// КК9 — Главный файл v0.9.1 (ИСПРАВЛЕНО: drag & drop)
// ============================================================

import {
  CharacterDataModel, NpcLightDataModel, NpcHardDataModel, NpcBossDataModel,
  FacultyDataModel, AbilityDataModel, WeaponDataModel, GearDataModel,
  ArtifactDataModel, SpellDataModel, DaemonDataModel, CompanionDataModel,
  VehicleDataModel, DeviceDataModel, ContactDataModel, LanguageDataModel,
  StatusDataModel
} from "./module/data-models.mjs";

import { KK9Actor, KK9Item } from "./module/documents.mjs";

// FIX: Персонаж и айтем — из sheets.mjs (НПС-листы убраны оттуда)
import {
  KK9CharacterSheet, KK9ItemSheet
} from "./module/sheets.mjs";

// FIX: НПС-листы — из npc-sheets.mjs (единственный источник правды)
import {
  KK9NpcLightSheet, KK9NpcHardSheet, KK9NpcBossSheet
} from "./module/npc-sheets.mjs";

import { registerCombatHooks, registerChatListeners } from "./module/weapon-combat.mjs";

// ============================================================
// Дефолтные изображения
// ============================================================
const KK9_DEFAULTS = {
  actor:        "systems/kk9/media/actor-default.png",
  item:         "systems/kk9/media/item-default.png",
  skillAbility: "systems/kk9/media/skill-default.png",
  sceneBg:      "systems/kk9/media/scene-background.png",
};

const SKILL_TYPES = new Set(["ability","faculty","language"]);

// ============================================================
// INIT
// ============================================================
Hooks.once("init", function () {
  console.log("КК9 | Инициализация v0.9.1");

  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass  = KK9Item;
  CONFIG.Actor.defaultToken  = KK9_DEFAULTS.actor;

  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light": NpcLightDataModel,
    "npc-hard":  NpcHardDataModel,
    "npc-boss":  NpcBossDataModel
  };

  CONFIG.Item.dataModels = {
    "faculty":   FacultyDataModel,
    "ability":   AbilityDataModel,
    "weapon":    WeaponDataModel,
    "gear":      GearDataModel,
    "artifact":  ArtifactDataModel,
    "spell":     SpellDataModel,
    "daemon":    DaemonDataModel,
    "companion": CompanionDataModel,
    "vehicle":   VehicleDataModel,
    "device":    DeviceDataModel,
    "contact":   ContactDataModel,
    "language":  LanguageDataModel,
    "status":    StatusDataModel
  };

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("kk9", KK9CharacterSheet, { types:["character"], makeDefault:true, label:"КК9 | Персонаж" });
  Actors.registerSheet("kk9", KK9NpcLightSheet,  { types:["npc-light"], makeDefault:true, label:"КК9 | НПС лёгкий" });
  Actors.registerSheet("kk9", KK9NpcHardSheet,   { types:["npc-hard"],  makeDefault:true, label:"КК9 | НПС сложный" });
  Actors.registerSheet("kk9", KK9NpcBossSheet,   { types:["npc-boss"],  makeDefault:true, label:"КК9 | Босс" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("kk9", KK9ItemSheet, { makeDefault:true, label:"КК9 | Предмет" });

  // Боевые хуки (статусы по ходам)
  registerCombatHooks();

  _registerHelpers();
  _preloadTemplates();

  console.log("КК9 | Готово ✓");
});

// ============================================================
// Хук preCreateActor
// ============================================================
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  const defaultFoundry = "icons/svg/mystery-man.svg";
  if (!data.img || data.img === defaultFoundry || data.img === CONST.DEFAULT_TOKEN) {
    actor.updateSource({ img: KK9_DEFAULTS.actor });
  }
  if (!data.prototypeToken?.texture?.src || data.prototypeToken?.texture?.src === defaultFoundry) {
    actor.updateSource({ "prototypeToken.texture.src": KK9_DEFAULTS.actor });
  }
  // Все акторы — linked token (один инстанс, токен = карточка)
  actor.updateSource({ "prototypeToken.actorLink": true });
});

// ============================================================
// Хук preCreateItem
// ============================================================
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const defaultFoundry = "icons/svg/item-bag.svg";
  if (!data.img || data.img === defaultFoundry || data.img.startsWith("icons/svg/")) {
    const img = SKILL_TYPES.has(data.type) ? KK9_DEFAULTS.skillAbility : KK9_DEFAULTS.item;
    item.updateSource({ img });
  }
});

// ============================================================
// Хук createActor — базовые навыки
// ============================================================
Hooks.on("createActor", async (actor, options, userId) => {
  if (game.userId !== userId) return;

  const badImgs = ["icons/svg/mystery-man.svg", "icons/svg/aura.svg", CONST.DEFAULT_TOKEN, ""];
  if (!actor.img || badImgs.includes(actor.img)) {
    await actor.update({ img: KK9_DEFAULTS.actor, "prototypeToken.texture.src": KK9_DEFAULTS.actor });
  }

  if (actor.type !== "character") return;

  // Базовые способности из компендиума kk9-abilities с флагом isBase
  const pack = game.packs.get("kk9.kk9-abilities");
  if (!pack) return;

  await pack.getIndex();
  const allDocs = await Promise.all(
    Array.from(pack.index).map(i => pack.getDocument(i._id))
  );

  const toCreate = allDocs.filter(d => d?.system?.isBase).map(s => s.toObject());

  if (toCreate.length) await Item.createDocuments(toCreate, { parent: actor });
});

// ============================================================
// READY
// ============================================================
Hooks.once("ready", async function() {
  console.log("КК9 | Система готова");

  // Слушатели кнопок в чате (атака, урон, сопротивление, промах)
  registerChatListeners();

  if (!game.user.isGM) return;
  await _ensureCompendiums();
  await _ensureStartScene();


});

// ============================================================
// Хук renderChatMessage
// ============================================================



Hooks.on("renderChatMessage", (message, html, data) => {
  const el = html[0] ?? html;

  el.classList.add("kk9-chat-message");

  if (message.flags?.kk9?.isRoll) {
    el.classList.add("kk9-roll-message");

    const header = el.querySelector(".message-header");
    if (header) header.style.display = "none";

    el.querySelectorAll(".dice-roll, .dice-tooltip, .dice-formula, .dice-total").forEach(e => {
      e.style.display = "none";
    });
  }

  // Красим .message-sender по факультету
  const actorId = message.flags?.kk9?.actorId ?? message.speaker?.actor;
  if (actorId) {
    const actor = game.actors?.get(actorId);
    if (actor) {
      const fColors = {
        white:"#e8e8e8", black:"#888888", blue:"#3b82f6", green:"#22c55e",
        purple:"#a855f7", red:"#ef4444", brown:"#92400e", mercury:"#94a3b8", invisible:"#6b7280"
      };
      const fKey  = actor.system?.faculty_key || actor.system?.faculty;
      const color = (fKey && fKey !== "none") ? (fColors[fKey] || "#888") : null;
      if (color) {
        const sender = el.querySelector(".message-sender");
        if (sender) sender.style.color = color;
      }
    }
  }
});

// ============================================================
// Handlebars helpers
// ============================================================
function _registerHelpers() {
  Handlebars.registerHelper("eq",  (a, b) => a === b);
  Handlebars.registerHelper("ne",  (a, b) => a !== b);
  Handlebars.registerHelper("gt",  (a, b) => a > b);
  Handlebars.registerHelper("lt",  (a, b) => a < b);
  Handlebars.registerHelper("gte", (a, b) => a >= b);
  Handlebars.registerHelper("add", (a, b) => a + b);
  Handlebars.registerHelper("lookup", (obj, key) => obj?.[key] ?? key);

  Handlebars.registerHelper("times", function(n, block) {
    let r = "";
    for (let i = 0; i < n; i++) r += block.fn(i + 1);
    return r;
  });

  Handlebars.registerHelper("healthLabel", (v) =>
    ["Здоров","Царапина","Ранен","Тяжело ранен","Критически","Без сознания"][v] || "Здоров"
  );
  Handlebars.registerHelper("mentalLabel", (v) =>
    ["Стабилен","Тревога","Потрясён","Сломлен","Кризис","Диссоциация"][v] || "Стабилен"
  );
  Handlebars.registerHelper("talentLabel", (v) =>
    ({ common:"Общая", personal:"Личная", learned:"Изучаемая", magic:"Магическая" })[v] || v
  );
  Handlebars.registerHelper("categoryLabel", (v) =>
    ({ common:"Общая", personal:"Личная", learned:"Изучаемая", magic:"Магическая" })[v] || v
  );
  Handlebars.registerHelper("orgTypeLabel", (v) => ({
    academic:"Академическая", criminal:"Криминальная", government:"Правительственная",
    magical:"Магическая", corporate:"Корпоративная", underground:"Подпольная", other:"Прочая"
  })[v] || v);
  Handlebars.registerHelper("typeIcon", (type) => ({
    weapon:"⚔", gear:"🎒", artifact:"✨", spell:"🔮",
    daemon:"👁", companion:"🐾", vehicle:"🚗", device:"⚙",
    contact:"📇", language:"🗣", skill:"📖", ability:"⚡", status:"⚡"
  })[type] || "📦");
  Handlebars.registerHelper("colorHex", (color) => ({
    black:"#1a1a1a", white:"#f0f0f0", gold:"#c4a44a", silver:"#c0c0c0",
    red:"#e53935", orange:"#fb8c00", green:"#43a047", blue:"#1e88e5",
    purple:"#8e24aa", yellow:"#fdd835", pink:"#f06292", pearl:"#e8d5c0", grey:"#9e9e9e"
  })[color] || "#888888");

  Handlebars.registerHelper("npcItemTypeLabel", (type) => ({
    weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание",
    daemon:"Даймон", companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
    contact:"Контакт", language:"Язык", status:"Статус"
  })[type] || type);
}

// ============================================================
// Preload templates
// ============================================================
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
    "systems/kk9/templates/items/faculty-sheet.hbs",
    "systems/kk9/templates/items/skill-sheet.hbs",
    "systems/kk9/templates/items/ability-sheet.hbs",
    "systems/kk9/templates/items/weapon-sheet.hbs",
    "systems/kk9/templates/items/status-sheet.hbs",
    "systems/kk9/templates/items/gear-sheet.hbs",
    "systems/kk9/templates/items/artifact-sheet.hbs",
    "systems/kk9/templates/items/spell-sheet.hbs",
    "systems/kk9/templates/items/daemon-sheet.hbs",
    "systems/kk9/templates/items/companion-sheet.hbs",
    "systems/kk9/templates/items/vehicle-sheet.hbs",
    "systems/kk9/templates/items/device-sheet.hbs",
    "systems/kk9/templates/items/contact-sheet.hbs",
    "systems/kk9/templates/items/language-sheet.hbs"
  ]);
}

// ============================================================
// Хук renderDialog — скрываем системные типы из диалога создания
// ============================================================
// Типы Item, которые нельзя создавать вручную из интерфейса
const HIDDEN_ITEM_TYPES = new Set(["faculty", "language"]);

Hooks.on("renderDialog", (dialog, html) => {
  // Ищем select с типами документа — он есть в диалоге Create Document
  const selects = html[0]
    ? html[0].querySelectorAll("select")
    : html.querySelectorAll("select");

  for (const select of selects) {
    const opts = Array.from(select.options);
    // Убеждаемся что это select с типами Item (есть хотя бы одна наша скрытая опция)
    const hasHidden = opts.some(o => HIDDEN_ITEM_TYPES.has(o.value));
    if (!hasHidden) continue;

    // Скрываем системные типы
    for (const opt of opts) {
      if (HIDDEN_ITEM_TYPES.has(opt.value)) {
        opt.hidden   = true;
        opt.disabled = true;
      }
    }

    // Если сейчас выбран скрытый тип — переключаем на первый видимый
    if (HIDDEN_ITEM_TYPES.has(select.value)) {
      const first = opts.find(o => !o.hidden);
      if (first) select.value = first.value;
    }
  }
});

// ============================================================
// Хук renderSidebarTab — стилизуем вкладку чата при открытии
// ============================================================
Hooks.on("renderSidebarTab", (app, html) => {
  if (app.tabName !== "chat") return;
  const textarea = html.find?.("#chat-message, textarea")?.[0];
  if (textarea) {
    textarea.style.fontFamily = "'Jost', sans-serif";
    textarea.style.fontSize   = "0.9em";
  }
});

// ============================================================
// Компендиумы
// ============================================================
async function _ensureCompendiums() {
  const skillPack = game.packs.get("kk9.kk9-skills");
  if (!skillPack) { console.warn("КК9 | Компендиум навыков не найден"); return; }
  await skillPack.getIndex();
  if (skillPack.index.size > 0) return;

  console.log("КК9 | Наполняем компендиумы...");

  const packNames = ["kk9-faculties","kk9-abilities","kk9-languages",
    "kk9-weapons","kk9-gear","kk9-artifacts","kk9-spells","kk9-daemons",
    "kk9-companions","kk9-vehicles","kk9-devices","kk9-contacts","kk9-statuses",
    "kk9-npc-light","kk9-npc-hard","kk9-npc-boss"];
  for (const name of packNames) {
    const p = game.packs.get(`kk9.${name}`);
    if (p) await p.configure({ locked: false });
  }

  const SKILLS_DATA = [
    {name:"Атлетика",                    attr:"agility" },
    {name:"Внимание",                    attr:"smarts"  },
    {name:"Скрытность",                  attr:"agility" },
    {name:"Убеждение",                   attr:"spirit"  },
    {name:"Рукопашный бой",              attr:"agility" },
    {name:"Обман",                       attr:"smarts"  },
    {name:"Ориентирование на местности", attr:"smarts"  },
    {name:"Память",                      attr:"smarts"  },
    {name:"Знания",                      attr:"smarts"  },
    {name:"Запугивание",                 attr:"spirit"  },
    {name:"Выживание",                   attr:"smarts"  },
    {name:"Вождение",                    attr:"agility" },
  ];

  const FACULTIES_DATA = [
    {name:"Белый факультет",      color:"#e8e8e8", teacher:"Белый",
     abilities:[{name:"Пытки",cat:"learned"},{name:"Тактика",cat:"learned"},{name:"Стрельба",cat:"learned"}]},
    {name:"Чёрный факультет",     color:"#1a1a1a", teacher:"Чёрный",
     abilities:[{name:"Тени",cat:"magic"},{name:"Ложь",cat:"learned"}]},
    {name:"Синий факультет",      color:"#3b82f6", teacher:"Синий",
     abilities:[{name:"Анализ",cat:"learned"},{name:"Техника",cat:"learned"}]},
    {name:"Зелёный факультет",    color:"#22c55e", teacher:"Зелёный",
     abilities:[{name:"Природа",cat:"magic"},{name:"Выживание",cat:"learned"}]},
    {name:"Фиолетовый факультет", color:"#a855f7", teacher:"Фиолетовый",
     abilities:[{name:"Иллюзии",cat:"magic"},{name:"Чтение",cat:"magic"}]},
    {name:"Красный факультет",    color:"#ef4444", teacher:"Красный",
     abilities:[{name:"Агрессия",cat:"personal"},{name:"Управление дроном",cat:"learned"}]},
    {name:"Незримый факультет",   color:"#6b7280", teacher:"Незримый",
     abilities:[{name:"Бытие бесполезным мудаком",cat:"personal"}]},
  ];

  const LANGUAGES = ["Русский","Английский","Немецкий","Французский","Испанский",
    "Латынь","Древний","Магический","Демонический","Технический","Жестовый","Азбука морзе"];

  await Item.createDocuments(
    SKILLS_DATA.map(sk => ({
      name: sk.name, type: "ability", img: KK9_DEFAULTS.skillAbility,
      system: { description:"", linkedAttribute:sk.attr, die:4, modifier:-2, isBase:true }
    })),
    { pack: "kk9.kk9-skills" }
  );

  const abPack = game.packs.get("kk9.kk9-abilities");
  for (const fac of FACULTIES_DATA) {
    const abilityRefs = [];
    if (abPack) {
      for (const ab of fac.abilities) {
        const [created] = await Item.createDocuments([{
          name: ab.name, type: "ability", img: KK9_DEFAULTS.skillAbility,
          system: { description:"", category:ab.cat, faculty_id:null, die:4, modifier:-2 }
        }], { pack: "kk9.kk9-abilities" });
        abilityRefs.push({ name:ab.name, itemId:created.id, category:ab.cat });
      }
    }
    await Item.createDocuments([{
      name: fac.name, type: "faculty", img: KK9_DEFAULTS.skillAbility,
      system: { description:"", color:fac.color, color_key:"", teacher:fac.teacher, abilities:abilityRefs }
    }], { pack: "kk9.kk9-faculties" });
  }

  await Item.createDocuments(
    LANGUAGES.map(lang => ({
      name: lang, type: "language", img: KK9_DEFAULTS.skillAbility,
      system: { description:"", region:"" }
    })),
    { pack: "kk9.kk9-languages" }
  );

  console.log("КК9 | Компендиумы заполнены!");
  ui.notifications.info("КК9 | Базовые данные загружены в компендиумы!");
}

// ============================================================
// Стартовая сцена
// ============================================================
async function _ensureStartScene() {
  if (game.scenes.size > 0) return;

  console.log("КК9 | Создаём стартовую сцену...");

  const scene = await Scene.create({
    name: "Кризисный Комитет №9",
    background: { src: KK9_DEFAULTS.sceneBg },
    grid: { type: 0, size: 100 },
    width: 1920, height: 1080,
    padding: 0,
    initial: { x: 960, y: 540, scale: 1.0 },
    active: true,
    navigation: true,
    backgroundColor: "#000000"
  });

  if (scene) await scene.activate();
  ui.notifications.info("КК9 | Стартовая сцена создана.");
}
