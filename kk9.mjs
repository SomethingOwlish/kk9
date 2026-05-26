// ============================================================
// КК9 — Главный файл v0.9.1 (ИСПРАВЛЕНО: drag & drop)
// ============================================================

import {
  CharacterDataModel, NpcLightDataModel, NpcHardDataModel, NpcBossDataModel, ContainerDataModel,
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
  KK9NpcLightSheet, KK9NpcHardSheet, KK9NpcBossSheet, KK9ContainerSheet
} from "./module/npc-sheets.mjs";

import { registerCombatHooks, registerChatListeners } from "./module/weapon-combat.mjs";

// ============================================================
// KK9Combat — переопределяем rollInitiative чтобы трекер
// вызывал нашу логику вместо стандартной формулы Foundry
// ============================================================
class KK9Combat extends Combat {
  async rollInitiative(ids, options = {}) {
    const combatantIds = typeof ids === "string" ? [ids] : ids;
    for (const id of combatantIds) {
      const combatant = this.combatants.get(id);
      if (!combatant?.actor) continue;
      await combatant.actor.rollInitiative();
    }
    return this;
  }
}

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
// BackgroundsConfig — редактор бэкграундов создания персонажа
// ============================================================
class BackgroundsConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "КК9 | Редактор бэкграундов",
      id:    "kk9-backgrounds-config",
      width: 500, height: 560,
      resizable: false,
      template: null // рендерим через _renderInner
    });
  }

  _getHeaderButtons() {
    return [{ label:"Закрыть", class:"close", icon:"fas fa-times", onclick:()=>this.close() }];
  }

  async _renderInner(data) {
    const bgs = this._getBgs();
    const rows = bgs.map((b,i)=>`
      <div class="bg-cfg-row" data-idx="${i}">
        <div class="bg-cfg-fields">
          <input class="bg-cfg-label" type="text" placeholder="Название" value="${b.label}" data-field="label"/>
          <input class="bg-cfg-cost"  type="number" min="0" value="${b.cost}" data-field="cost" style="width:54px"/>
          <button type="button" class="bg-cfg-del btn-delete-xs">✕</button>
        </div>
        <textarea class="bg-cfg-desc" placeholder="Описание..." rows="2" data-field="desc">${b.desc||""}</textarea>
      </div>`).join("");

    const html = $(`<form class="kk9-bg-cfg-form">
      <style>
        .kk9-bg-cfg-form { --bg:#1c1c1c; --bg2:#232323; --bg3:#2a2a2a;
          --border:#3a3a3a; --border2:#4a4a4a; --text:#b8b0a4;
          --text-dim:#6a6560; --gold:#c4a44a; --gold-dim:#7a6430; --accent2:#c0392b;
          background:var(--bg2); color:var(--text); font-family:'Jost',sans-serif;
          padding:12px; display:flex; flex-direction:column; gap:8px; height:100%; box-sizing:border-box; }
        .bg-cfg-hint { font-size:0.76em; color:var(--text-dim); margin-bottom:4px; }
        .bg-cfg-scroll { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:8px;
                         scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
        .bg-cfg-row { background:var(--bg3); border:1px solid var(--border); border-radius:3px; padding:8px; }
        .bg-cfg-fields { display:flex; gap:6px; align-items:center; margin-bottom:6px; }
        .bg-cfg-label { flex:1; background:var(--bg2); border:1px solid var(--border); border-radius:3px;
                         color:var(--text); padding:4px 7px; font-family:'Jost',sans-serif; font-size:0.84em; }
        .bg-cfg-cost  { background:var(--bg2); border:1px solid var(--border); border-radius:3px;
                         color:var(--gold); padding:4px 6px; font-family:'Jost',sans-serif;
                         font-size:0.84em; text-align:center; }
        .bg-cfg-del   { background:transparent; border:none; color:var(--border2);
                         cursor:pointer; font-size:0.9em; flex-shrink:0; transition:color 0.12s; }
        .bg-cfg-del:hover { color:var(--accent2); }
        .bg-cfg-desc  { width:100%; background:var(--bg2); border:1px solid var(--border); border-radius:3px;
                         color:var(--text-dim); padding:4px 7px; font-family:'Jost',sans-serif;
                         font-size:0.78em; resize:none; box-sizing:border-box; }
        .bg-cfg-add   { background:transparent; border:1px solid var(--border2); border-radius:3px;
                         color:var(--text-dim); padding:5px 12px; cursor:pointer;
                         font-family:'Jost',sans-serif; font-size:0.82em; transition:all 0.12s; }
        .bg-cfg-add:hover { border-color:var(--gold-dim); color:var(--gold); }
        .bg-cfg-save  { background:rgba(196,164,74,0.1); border:1px solid var(--gold-dim); border-radius:3px;
                         color:var(--gold); padding:6px 16px; cursor:pointer; font-family:'Jost',sans-serif;
                         font-size:0.84em; font-weight:500; transition:all 0.12s; }
        .bg-cfg-save:hover { background:rgba(196,164,74,0.2); }
        .bg-cfg-footer { display:flex; justify-content:space-between; align-items:center;
                          padding-top:8px; border-top:1px solid var(--border); flex-shrink:0; }
      </style>
      <p class="bg-cfg-hint">Название · Цена (оч.) · Описание. Порядок — как будет показан игроку.</p>
      <div class="bg-cfg-scroll">${rows}</div>
      <div class="bg-cfg-footer">
        <button type="button" class="bg-cfg-add">+ Добавить бэкграунд</button>
        <button type="button" class="bg-cfg-save">Сохранить</button>
      </div>
    </form>`);

    html.find(".bg-cfg-del").on("click", function() {
      $(this).closest(".bg-cfg-row").remove();
    });
    html.find(".bg-cfg-add").on("click", () => {
      const newRow = $(`<div class="bg-cfg-row" data-idx="new">
        <div class="bg-cfg-fields">
          <input class="bg-cfg-label" type="text" placeholder="Название" value="" data-field="label"/>
          <input class="bg-cfg-cost" type="number" min="0" value="2" data-field="cost" style="width:54px"/>
          <button type="button" class="bg-cfg-del btn-delete-xs">✕</button>
        </div>
        <textarea class="bg-cfg-desc" placeholder="Описание..." rows="2" data-field="desc"></textarea>
      </div>`);
      newRow.find(".bg-cfg-del").on("click", function() { $(this).closest(".bg-cfg-row").remove(); });
      html.find(".bg-cfg-scroll").append(newRow);
    });
    html.find(".bg-cfg-save").on("click", async () => {
      const result = [];
      html.find(".bg-cfg-row").each(function(i) {
        const label = $(this).find("[data-field='label']").val().trim();
        if (!label) return;
        result.push({
          key:   `bg_${i}_${Date.now()}`,
          label, cost:  parseInt($(this).find("[data-field='cost']").val()) || 0,
          desc:  $(this).find("[data-field='desc']").val().trim()
        });
      });
      await game.settings.set("kk9", "chargen.backgrounds", JSON.stringify(result));
      ui.notifications.info("КК9 | Бэкграунды сохранены.");
      this.close();
    });
    return html;
  }

  _getBgs() {
    try { return JSON.parse(game.settings.get("kk9", "chargen.backgrounds")); }
    catch { return []; }
  }

  async _updateObject() {}
}

// ============================================================
// INIT
// ============================================================
Hooks.once("init", function () {
  console.log("КК9 | Инициализация v0.9.9");

  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass  = KK9Item;
  CONFIG.Actor.defaultToken  = KK9_DEFAULTS.actor;
  CONFIG.Combat.documentClass = KK9Combat;

  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light": NpcLightDataModel,
    "npc-hard":  NpcHardDataModel,
    "npc-boss":  NpcBossDataModel,
    "container": ContainerDataModel
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
  Actors.registerSheet("kk9", KK9ContainerSheet, { types:["container"], makeDefault:true, label:"КК9 | Контейнер" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("kk9", KK9ItemSheet, { makeDefault:true, label:"КК9 | Предмет" });

  // Боевые хуки (статусы по ходам)
  registerCombatHooks();

  // ── Настройки создания персонажа ──
  const chargenSettings = [
    { key: "chargen.points.attributes",    name: "КК9 | Очки атрибутов",          hint: "Стартовые очки для распределения атрибутов",      default: 6, type: Number },
    { key: "chargen.points.skills",        name: "КК9 | Базовые очки навыков",     hint: "Стартовые очки навыков (сверх конвертации)",       default: 8, type: Number },
    { key: "chargen.convert.attr_to_skill",name: "КК9 | Конвертация атр→навык",    hint: "Сколько очков навыков даёт 1 очко атрибута",       default: 5, type: Number },
    { key: "chargen.attr.max_die",         name: "КК9 | Макс. кубик атрибута",     hint: "Максимальный кубик атрибута при создании",         default: 8, type: Number },
    { key: "chargen.skills.max_save",      name: "КК9 | Макс. сохранение навыков", hint: "Максимум очков навыков переносимых на бэкграунды", default: 5, type: Number },
    { key: "chargen.special.cost",         name: "КК9 | Цена спецспособности",     hint: "Очков навыков за одну спецспособность",            default: 3, type: Number },
    { key: "chargen.special.max",          name: "КК9 | Макс. спецспособностей",   hint: "Максимум спецспособностей при создании",           default: 2, type: Number },
  ];
  for (const s of chargenSettings) {
    game.settings.register("kk9", s.key, {
      name: s.name, hint: s.hint, scope: "world",
      config: true, default: s.default, type: s.type
    });
  }

  // Бэкграунды — хранятся как JSON, редактируются через отдельное окно
  const BG_DEFAULTS = JSON.stringify([
    { key:"ally",     label:"Союзник из прошлого", cost:2, desc:"НПС который встретит вас после События и будет доброжелателен." },
    { key:"artifact", label:"Артефакт",             cost:3, desc:"У вас есть артефакт — вы пока не знаете как он работает." },
    { key:"memory",   label:"Память о КК9",         cost:2, desc:"В детстве вы видели проявления КК9. Память стёрта — но вы вспомните." },
  ]);
  game.settings.register("kk9", "chargen.backgrounds", {
    name:"КК9 | Бэкграунды (JSON)", scope:"world", config:false,
    default:BG_DEFAULTS, type:String
  });
  game.settings.registerMenu("kk9", "chargen.backgroundsMenu", {
    name:"КК9 | Редактор бэкграундов",
    label:"Открыть редактор",
    hint:"Добавляй, удаляй и настраивай бэкграунды персонажа",
    icon:"fas fa-scroll",
    type: BackgroundsConfig,
    restricted:true
  });

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

  // Энергия на старте = максимум (для всех типов у которых есть energy)
  const energyMax = actor.system.energy?.max ?? 0;
  if (energyMax > 0) {
    await actor.update({ "system.energy.value": energyMax });
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
// Хук updateActor — синхронизация energy.value при росте max
// ============================================================
Hooks.on("updateActor", async (actor, changes, options, userId) => {
  if (game.userId !== userId) return;

  // Проверяем изменились ли поля влияющие на energy.max
  const sys = changes.system;
  if (!sys) return;

  const affectsMax =
    "age" in sys ||
    sys.attributes?.spirit?.die !== undefined;

  if (!affectsMax) return;

  // Вычисляем старый max вручную из данных ДО изменения
  // changes содержит новые значения — берём старые из _source
  const src = actor._source?.system ?? {};
  const oldAge      = "age" in sys
    ? (typeof src.age === "number" ? src.age : parseInt(src.age) || 0)
    : (typeof actor.system.age === "number" ? actor.system.age : parseInt(actor.system.age) || 0);
  const oldSpiritDie = sys.attributes?.spirit?.die !== undefined
    ? (src.attributes?.spirit?.die ?? 6)
    : (actor.system.attributes?.spirit?.die ?? 6);

  const newMax = actor.system.energy?.max ?? 0;
  const oldMax = oldAge + oldSpiritDie;
  const delta  = newMax - oldMax;

  if (delta <= 0) {
    // Если max уменьшился — обрезаем value если оно вышло за max
    const curVal2 = actor.system.energy?.value ?? 0;
    const newMax2 = actor.system.energy?.max ?? 0;
    if (curVal2 > newMax2) await actor.update({ "system.energy.value": newMax2 });
    return;
  }

  const curVal = actor.system.energy?.value ?? 0;
  const newVal = Math.min(curVal + delta, newMax);
  if (newVal !== curVal) {
    await actor.update({ "system.energy.value": newVal });
  }
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
  await _ensureMasterJournal();
  await _patchBaseAbilitiesForTest();


});

// ============================================================
// Хук renderChatMessage
// ============================================================



Hooks.on("renderChatMessageHTML", (message, el, data) => {

  el.classList.add("kk9-chat-message");

  if (message.flags?.kk9?.isRoll || message.flags?.kk9?.isCombatMsg) {
    el.classList.add("kk9-roll-message");

    const header = el.querySelector(".message-header");
    if (header) {
      header.style.setProperty("display", "none", "important");
      header.style.setProperty("height", "0", "important");
      header.style.setProperty("overflow", "hidden", "important");
      header.style.setProperty("padding", "0", "important");
      header.style.setProperty("margin", "0", "important");
    }

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
  const packNames = ["kk9-faculties","kk9-abilities","kk9-languages","kk9-skills",
    "kk9-weapons","kk9-gear","kk9-artifacts","kk9-spells","kk9-daemons",
    "kk9-companions","kk9-vehicles","kk9-devices","kk9-contacts","kk9-statuses",
    "kk9-npc-light","kk9-npc-hard","kk9-npc-boss"];

  // Всегда разлочиваем перед работой
  for (const name of packNames) {
    const p = game.packs.get(`kk9.${name}`);
    if (p?.locked) await p.configure({ locked: false });
  }

  const skillPack = game.packs.get("kk9.kk9-skills");
  if (!skillPack) { console.warn("КК9 | Компендиум навыков не найден"); return; }
  await skillPack.getIndex();
  if (skillPack.index.size > 0) {
    // Компендиум уже заполнен — проверяем и проставляем isBase если нет
    const allSkills = await Promise.all(Array.from(skillPack.index).map(i => skillPack.getDocument(i._id)));
    for (const sk of allSkills) {
      if (sk && !sk.system.isBase) await sk.update({ "system.isBase": true });
    }
    console.log("КК9 | isBase проставлен для всех базовых навыков.");
    return;
  }

  console.log("КК9 | Наполняем компендиумы...");

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

// ── Получить настройку создания персонажа ──
export function _getChargenSetting(key) {
  return game.settings.get("kk9", key);
}

// ── Журнал "Мастерские дела" ──
async function _ensureMasterJournal() {
  const existing = game.journal.find(j => j.getFlag("kk9", "isMasterJournal"));
  if (existing) return existing;

  console.log("КК9 | Создаём журнал «Мастерские дела»...");
  const journal = await JournalEntry.create({
    name: "Мастерские дела",
    ownership: { default: 0 }
  });
  if (journal) {
    await journal.setFlag("kk9", "isMasterJournal", true);
    ui.notifications.info("КК9 | Журнал «Мастерские дела» создан.");
  }
  return journal;
}

// Временная функция для тестов — проставляет isBase двум первым способностям компендиума
async function _patchBaseAbilitiesForTest() {
  const pack = game.packs.get("kk9.kk9-abilities");
  if (!pack) return;
  await pack.getIndex();
  const allDocs = await Promise.all(
    Array.from(pack.index).slice(0, 2).map(i => pack.getDocument(i._id))
  );
  for (const doc of allDocs) {
    if (doc && !doc.system.isBase) {
      await doc.update({ "system.isBase": true });
      console.log(`КК9 | isBase = true → ${doc.name}`);
    }
  }
}
