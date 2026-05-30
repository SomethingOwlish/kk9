// ============================================================
// КК9 — Главный файл v0.9.1 (ИСПРАВЛЕНО: drag & drop)
// ============================================================

import {
  CharacterDataModel, NpcLightDataModel, NpcHardDataModel, NpcBossDataModel, ContainerDataModel,
  DaemonActorDataModel, CompanionActorDataModel,
  FacultyDataModel, AbilityDataModel, WeaponDataModel, GearDataModel,
  ArtifactDataModel, SpellDataModel,
  VehicleDataModel, DeviceDataModel, ContactDataModel, LanguageDataModel,
  StatusDataModel
} from "./module/data-models.mjs";

import { KK9Actor, KK9Item } from "./module/documents.mjs";

// FIX: Персонаж и айтем — из sheets.mjs (НПС-листы убраны оттуда)
import {
  KK9CharacterSheet, KK9ItemSheet, KK9DaemonSheet, KK9CompanionSheet
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
// ResetCompendiumsConfig — кнопка пересоздания компендиумов
// ============================================================
class ResetCompendiumsConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title:"КК9 | Пересоздать компендиумы", width:400, height:"auto"
    });
  }
  async _renderInner() {
    const el = $(`<form style="font-family:'Jost',sans-serif;padding:12px;background:#232323;color:#b8b0a4;">
      <p style="margin-bottom:12px;font-size:0.86em;color:#6a6560;">
        Это действие <strong style="color:#c4a44a;">полностью очистит</strong> компендиумы
        <em>kk9-abilities</em>, <em>kk9-faculties</em>, <em>kk9-languages</em>
        и заполнит их заново из встроенных данных.
      </p>
      <p style="font-size:0.82em;color:#6a6560;margin-bottom:16px;">
        Все ручные изменения в этих компендиумах будут потеряны.<br>
        Персонажи и их предметы не затрагиваются.
      </p>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" id="cmp-cancel"
          style="padding:5px 14px;background:transparent;border:1px solid #3a3a3a;
                 border-radius:3px;color:#b8b0a4;cursor:pointer;font-family:'Jost',sans-serif;">
          Отмена
        </button>
        <button type="button" id="cmp-confirm"
          style="padding:5px 14px;background:rgba(196,164,74,.1);border:1px solid #7a6430;
                 border-radius:3px;color:#c4a44a;cursor:pointer;font-family:'Jost',sans-serif;font-weight:500;">
          Пересоздать
        </button>
      </div>
    </form>`);
    el.find("#cmp-cancel").on("click", () => this.close());
    el.find("#cmp-confirm").on("click", async () => {
      this.close();
      ui.notifications.info("КК9 | Пересоздаём компендиумы...");
      await _resetAndRefillCompendiums();
    });
    return el;
  }
  async _updateObject() {}
}

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
  console.log("КК9 | Инициализация v0.9.10");

  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass  = KK9Item;
  CONFIG.Actor.defaultToken  = KK9_DEFAULTS.actor;
  CONFIG.Combat.documentClass = KK9Combat;

  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light": NpcLightDataModel,
    "npc-hard":  NpcHardDataModel,
    "npc-boss":  NpcBossDataModel,
    "container": ContainerDataModel,
    "daemon":    DaemonActorDataModel,
    "companion": CompanionActorDataModel
  };

  CONFIG.Item.dataModels = {
    "faculty":   FacultyDataModel,
    "ability":   AbilityDataModel,
    "weapon":    WeaponDataModel,
    "gear":      GearDataModel,
    "artifact":  ArtifactDataModel,
    "spell":     SpellDataModel,
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
  Actors.registerSheet("kk9", KK9DaemonSheet,    { types:["daemon"],    makeDefault:true, label:"КК9 | Даймон" });
  Actors.registerSheet("kk9", KK9CompanionSheet, { types:["companion"], makeDefault:true, label:"КК9 | Спутник" });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("kk9", KK9ItemSheet, { makeDefault:true, label:"КК9 | Предмет" });

  // Боевые хуки (статусы по ходам)
  registerCombatHooks();

  // ── Настройки создания персонажа ──
  const chargenSettings = [
    { key: "chargen.points.attributes",    name: "КК9 | Очки атрибутов",          hint: "Стартовые очки для распределения атрибутов",      default: 6, type: Number },
    { key: "chargen.points.skills",        name: "КК9 | Базовые очки навыков",     hint: "Стартовые очки навыков",       default: 8, type: Number },
    { key: "chargen.convert.attr_to_skill",name: "КК9 | Конвертация атр→навык",    hint: "Сколько очков навыков даёт 1 очко атрибута",       default: 5, type: Number },
    { key: "chargen.attr.max_die",         name: "КК9 | Макс. кубик атрибута",     hint: "Максимальный кубик атрибута при создании",         default: 8, type: Number },
    { key: "chargen.skills.max_save",      name: "КК9 | Макс. сохранение навыков", hint: "Максимум очков навыков переносимых на бэкграунды", default: 5, type: Number },
    { key: "chargen.special.cost",         name: "КК9 | Цена спецспособности",     hint: "Очков навыков за одну спецспособность",            default: 3, type: Number },
    { key: "chargen.special.max",          name: "КК9 | Макс. спецспособностей",   hint: "Максимум спецспособностей при создании",           default: 2, type: Number },
    { key: "status.charges_per_trigger",   name: "КК9 | Статус: зарядов на N бросков", hint: "Каждые N бросков срабатывают статусы категории 2 (яд, заражение, болезнь, холод)", default: 3, type: Number },
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

  game.settings.registerMenu("kk9", "resetCompendiumsMenu", {
    name:"КК9 | Пересоздать компендиумы",
    label:"Пересоздать",
    hint:"Очищает и заново заполняет базовые компендиумы (навыки, факультеты, языки). Используй если данные сломаны или устарели.",
    icon:"fas fa-sync",
    type: ResetCompendiumsConfig,
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
// Хук Observer прав на новые ref-итемы
// ============================================================
const _prevRefs = new Map(); // actorId → { field → Set<uuid> }

Hooks.on("preUpdateActor", (actor, changes) => {
  const sys = changes.system;
  if (!sys) return;
  const REF_FIELDS = ["artifact_refs","daemon_refs","companion_refs","contact_refs"];
  if (!REF_FIELDS.some(f => Array.isArray(sys[f]))) return;

  // Сохраняем текущие (старые) значения перед обновлением
  const prev = {};
  for (const f of REF_FIELDS) {
    if (Array.isArray(sys[f])) {
      prev[f] = new Set(actor.system[f] || []);
    }
  }
  _prevRefs.set(actor.id, prev);
});

Hooks.on("updateActor", async (actor, changes, options, userId) => {
  // Только GM выставляет права
  if (!game.user.isGM) return;

  const sys = changes.system;
  if (!sys) return;
  if (!_prevRefs.has(actor.id)) return;

  const prev = _prevRefs.get(actor.id);
  _prevRefs.delete(actor.id);

  const REF_FIELDS = ["artifact_refs","daemon_refs","companion_refs","contact_refs"];

  // Находим владельцев актора (не GM, уровень Owner)
  const ownerIds = Object.entries(actor.ownership)
    .filter(([uid, lvl]) =>
      lvl === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER &&
      uid !== "default" &&
      uid !== game.user.id
    )
    .map(([uid]) => uid);

  if (!ownerIds.length) { _prevRefs.delete(actor.id); return; }

  for (const field of REF_FIELDS) {
    if (!Array.isArray(sys[field])) continue;
    const oldSet = prev[field] ?? new Set();
    const addedUuids = sys[field].filter(uuid => !oldSet.has(uuid));

    for (const uuid of addedUuids) {
      const doc = await fromUuid(uuid);
      if (!doc || doc.pack) continue; // пропускаем компендиумные

      const newOwnership = { ...doc.ownership };
      let changed = false;
      for (const uid of ownerIds) {
        const cur = newOwnership[uid] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        if (cur < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
          newOwnership[uid] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
          changed = true;
        }
      }
      if (changed) {
        await doc.update({ ownership: newOwnership });
        console.log(`КК9 | Observer: ${doc.name} → ${ownerIds.join(", ")}`);
      }
    }
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

  // ── Статус-хелперы ──────────────────────────────────────────
  Handlebars.registerHelper("statusTypeLabel", (type) => ({
    poison:       "Яд",
    bleed:        "Кровотечение",
    acid:         "Кислота",
    burn:         "Ожог",
    cold:         "Холод",
    electric:     "Электричество",
    infection:    "Заражение",
    disease:      "Болезнь",
    shock_mental: "Шок",
    fear:         "Страх",
    madness:      "Безумие",
    blindness:    "Слепота",
    magic_effect: "Магический эффект",
    curse:        "Проклятие",
    debt_fate:    "Долг судьбы",
    debt:         "Долг",
  })[type] || type);

  // Проверка — входит ли значение в массив
  Handlebars.registerHelper("includes", (arr, val) => Array.isArray(arr) && arr.includes(val));

  // Шкала граней куба для применения die_change в рантайме (не для отображения)
  const DIE_SCALE = [4, 6, 8, 10, 12, 20, 100];

  // Отображение die_change — только шаги, без конкретной грани
  Handlebars.registerHelper("dieChangeLabel", (change) => {
    if (!change || change === 0) return "без изменений";
    const sign = change > 0 ? "+" : "";
    return `${sign}${change} шаг${Math.abs(change) === 1 ? "" : (Math.abs(change) < 5 ? "а" : "ов")}`;
  });

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
    "systems/kk9/templates/actors/daemon-sheet.hbs",
    "systems/kk9/templates/actors/companion-sheet.hbs",
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
// Принудительный сброс и пересоздание компендиумов
// ============================================================
async function _resetAndRefillCompendiums() {
  const packNames = ["kk9-faculties","kk9-abilities","kk9-languages",
    "kk9-weapons","kk9-gear","kk9-artifacts","kk9-spells","kk9-daemons",
    "kk9-companions","kk9-vehicles","kk9-devices","kk9-contacts","kk9-statuses",
    "kk9-npc-light","kk9-npc-hard","kk9-npc-boss"];
  for (const name of packNames) {
    const p = game.packs.get(`kk9.${name}`);
    if (p?.locked) await p.configure({ locked: false });
  }
  // Очистка
  const packsToClear = ["kk9-abilities","kk9-faculties","kk9-languages"];
  for (const name of packsToClear) {
    const p = game.packs.get(`kk9.${name}`);
    if (!p) continue;
    const docs = await p.getDocuments();
    if (docs.length) await Promise.all(docs.map(d => d.delete()));
    console.log(`КК9 | Очищен: ${name} (${docs.length} записей)`);
  }
  // Заполняем заново — через _ensureCompendiums но без guard
  // Временно сбрасываем индекс чтобы guard не сработал
  const abPack = game.packs.get("kk9.kk9-abilities");
  if (abPack) abPack._index = new Collection();
  await _ensureCompendiums();
  ui.notifications.info("КК9 | Компендиумы пересозданы!");
}

// ============================================================
// Компендиумы
// ============================================================
async function _ensureCompendiums() {
  const packNames = ["kk9-faculties","kk9-abilities","kk9-languages",
    "kk9-weapons","kk9-gear","kk9-artifacts","kk9-spells","kk9-daemons",
    "kk9-companions","kk9-vehicles","kk9-devices","kk9-contacts","kk9-statuses",
    "kk9-npc-light","kk9-npc-hard","kk9-npc-boss"];

  // Всегда разлочиваем перед работой
  for (const name of packNames) {
    const p = game.packs.get(`kk9.${name}`);
    if (p?.locked) await p.configure({ locked: false });
  }

  const skillPack = game.packs.get("kk9.kk9-abilities");
  if (!skillPack) { console.warn("КК9 | Компендиум способностей не найден"); return; }
  await skillPack.getIndex();
  if (skillPack.index.size > 0) {
    // Уже заполнен — только разлочиваем
    console.log("КК9 | Компендиумы уже заполнены, пропускаем.");
    return;
  }

  console.log("КК9 | Очищаем и наполняем компендиумы...");

  // ── Очистка перед заполнением ──
  const packsToClear = ["kk9-abilities","kk9-faculties","kk9-languages"];
  for (const name of packsToClear) {
    const p = game.packs.get(`kk9.${name}`);
    if (!p) continue;
    await p.getIndex();
    const ids = Array.from(p.index).map(i => i._id);
    if (ids.length) await p.getDocuments().then(docs => Promise.all(docs.map(d => d.delete())));
  }

  // ── Данные ниже, создание в конце функции ──

  const SKILLS_DATA = [
  {name:"Плавание", attr:"endurance", base:true, categ:"learned"},
  {name:"Атлетика", attr:"endurance", base:true, categ:"common"},
  {name:"Общая эрудиция", attr:"smarts", base:true, categ:"common"},
  {name:"Техника", attr:"smarts", base:true, categ:"learned"},
  {name:"Электроника", attr:"smarts", base:true, categ:"common"},
  {name:"Ориентирование", attr:"smarts", base:true, categ:"learned"},
  {name:"Наблюдательность", attr:"smarts", base:true, categ:"common"},
  {name:"Языки", attr:"smarts", base:true, categ:"common"},
  {name:"Анализ", attr:"smarts", base:true, categ:"common"},
  {name:"Знание Нижнего Мира", attr:"smarts", base:true, categ:"common"},
  {name:"Эмпатия", attr:"spirit", base:true, categ:"common"},
  {name:"Самоконтроль", attr:"spirit", base:true, categ:"learned"},
  {name:"Убеждение", attr:"spirit", base:true, categ:"common"},
  {name:"Обман", attr:"spirit", base:true, categ:"learned"},
  {name:"Запугивание", attr:"spirit", base:true, categ:"common"},
  {name:"Исполнение", attr:"spirit", base:true, categ:"common"},
  {name:"Медитация", attr:"spirit", base:false, categ:"learned"},
  {name:"Интуиция", attr:"magic", base:true, categ:"common"},
  {name:"Рукопашный бой", attr:"agility", base:true, categ:"common"},
  {name:"Кулинария", attr:"agility", base:true, categ:"learned"},
  {name:"Скрытность", attr:"agility", base:true, categ:"common"},
  {name:"Координация", attr:"agility", base:true, categ:"common"},
  {name:"Тактика", attr:"smarts", base:false, categ:"learned"},
  {name:"Логические игры", attr:"smarts", base:false, categ:"learned"},
  {name:"Этикет", attr:"smarts", base:false, categ:"learned"},
  {name:"Знание Верхнего Мира", attr:"smarts", base:false, categ:"learned"},
  {name:"Манипуляция", attr:"smarts", base:false, categ:"learned"},
  {name:"Детект менджик", attr:"smarts", base:false, categ:"learned"},
  {name:"Системы безопасности", attr:"smarts", base:false, categ:"learned"},
  {name:"Токсикология", attr:"smarts", base:false, categ:"learned"},
  {name:"Медицина", attr:"smarts", base:false, categ:"learned"},
  {name:"Расследование", attr:"smarts", base:false, categ:"common"},
  {name:"Big Data", attr:"smarts", base:false, categ:"learned"},
  {name:"Программирование", attr:"smarts", base:false, categ:"learned"},
  {name:"Информационная безопасность", attr:"smarts", base:false, categ:"learned"},
  {name:"Хакинг", attr:"smarts", base:false, categ:"learned"},
  {name:"Криптография", attr:"smarts", base:false, categ:"learned"},
  {name:"Профайлинг", attr:"smarts", base:false, categ:"learned"},
  {name:"Актерское мастерство", attr:"spirit", base:false, categ:"learned"},
  {name:"Политология", attr:"smarts", base:false, categ:"learned"},
  {name:"Риторика", attr:"smarts", base:false, categ:"learned"},
  {name:"Инженерия", attr:"smarts", base:false, categ:"learned"},
  {name:"Военные технологии", attr:"smarts", base:false, categ:"learned"},
  {name:"Юриспруденция", attr:"smarts", base:false, categ:"learned"},
  {name:"Владение клинковым оружием", attr:"agility", base:false, categ:"learned"},
  {name:"Владение древковым оружием", attr:"agility", base:false, categ:"learned"},
  {name:"Владение метательным/стрелковым оружием", attr:"agility", base:false, categ:"learned"},
  {name:"Владение огнестрельным оружием", attr:"agility", base:false, categ:"learned"},
  {name:"Артиллерия", attr:"agility", base:false, categ:"learned"},
  {name:"Дроны", attr:"agility", base:false, categ:"learned"},
  {name:"Вождение летательных средств", attr:"agility", base:false, categ:"learned"},
  {name:"Воровство", attr:"agility", base:false, categ:"learned"},
  {name:"Танец", attr:"agility", base:false, categ:"learned"},
  {name:"Восточное искусство", attr:"agility", base:false, categ:"learned"},
  {name:"Боевые искусства", attr:"agility", base:false, categ:"learned"},
  {name:"Секс", attr:"agility", base:false, categ:"common"},
  {name:"Маскировка", attr:"agility", base:false, categ:"learned"},
  {name:"Вождение авто/мото техники", attr:"agility", base:false, categ:"learned"},
  {name:"Вождение специальных средств", attr:"agility", base:false, categ:"learned"},
  {name:"Массаж", attr:"agility", base:false, categ:"learned"},
  {name:"Первая помощь", attr:"agility", base:false, categ:"learned"},
  {name:"Сопротивление боли", attr:"endurance", base:false, categ:"learned"},
  {name:"Сопротивление магии", attr:"endurance", base:false, categ:"learned"},
  {name:"Выживание", attr:"endurance", base:false, categ:"learned"},
  {name:"Сопротивление ментальному давлению", attr:"spirit", base:false, categ:"learned"},
  {name:"Ведение допросов", attr:"spirit", base:false, categ:"learned"},
  {name:"Пытки и казни", attr:"spirit", base:false, categ:"learned"},
  {name:"Лидерство", attr:"spirit", base:false, categ:"learned"},
  {name:"Соблазнение", attr:"spirit", base:false, categ:"learned"},
  {name:"Хладнокровие", attr:"spirit", base:false, categ:"learned"},
  {name:"Внешний вид", attr:"spirit", base:false, categ:"learned"},
  {name:"Концентрация", attr:"spirit", base:false, categ:"learned"},
  {name:"Дрессировка", attr:"spirit", base:false, categ:"learned"},
  {name:"Артефактология", attr:"magic", base:false, categ:"learned"},
  {name:"Определение Магии", attr:"magic", base:false, categ:"learned"},
  {name:"Ритуалистика", attr:"magic", base:false, categ:"learned"},
  {name:"Владение магическими проводниками", attr:"magic", base:false, categ:"learned"},
  {name:"Прорицание", attr:"magic", base:false, categ:"magic"},
  {name:"Целительство", attr:"magic", base:false, categ:"magic"},
  {name:"Алхимия", attr:"magic", base:false, categ:"magic"},
  {name:"Магозоология", attr:"magic", base:false, categ:"magic"},
  {name:"Теория магии", attr:"magic", base:false, categ:"learned"},
  {name:"Матрицалогия - теория", attr:"magic", base:false, categ:"learned"},
  {name:"Техномантия", attr:"magic", base:false, categ:"magic"},
  {name:"Ментальная магия", attr:"magic", base:false, categ:"magic"},
  {name:"Даймонология", attr:"magic", base:false, categ:"magic"},
  {name:"Инфильтрация", attr:"smarts", base:false, categ:"learned"},
  {name:"Агентурная сеть", attr:"smarts", base:false, categ:"learned"},
  {name:"Яды и противоядия", attr:"smarts", base:false, categ:"learned"},
  {name:"Викка", attr:"smarts", base:false, categ:"magic"},
  {name:"Некромантия", attr:"magic", base:false, categ:"magic"},
  {name:"Вампиризм", attr:"agility", base:false, categ:"magic"},
  {name:"Оборотничество", attr:"endurance", base:false, categ:"magic"},
  {name:"Пиромантия", attr:"magic", base:false, categ:"magic"},
  {name:"Эмпирей", attr:"magic", base:false, categ:"magic"},
  {name:"Матрицалогия", attr:"magic", base:false, categ:"magic"},
  {name:"Зеркало вампира", attr:"endurance", base:false, categ:"magic"},
  {name:"Псионика", attr:"spirit", base:false, categ:"magic"},
  {name:"Жречество", attr:"magic", base:false, categ:"magic"},
  {name:"Гламур", attr:"magic", base:false, categ:"magic"},
  ];

  const FACULTIES_DATA = [
    {name:"Белый факультет",      color:"#e8e8e8", teacher:"Белый",
     abilities:[ {name:"Атлетика"},
  {name:"Самоконтроль"},
  {name:"Убеждение"},
  {name:"Медитация"},
  {name:"Координация"},
  {name:"Тактика"},
  {name:"Логические игры"},
  {name:"Этикет"},
  {name:"Знание Верхнего Мира"},
  {name:"Манипуляция"},
  {name:"Риторика"},
  {name:"Владение клинковым оружием"},
  {name:"Восточное искусство"},
  {name:"Боевые искусства"},
  {name:"Первая помощь"},
  {name:"Сопротивление боли"},
  {name:"Сопротивление магии"},
  {name:"Сопротивление ментальному давлению"},
  {name:"Ведение допросов"},
  {name:"Лидерство"},
  {name:"Хладнокровие"},
  {name:"Владение магическими проводниками"}]},
    {name:"Чёрный факультет",     color:"#1a1a1a", teacher:"Чёрный",
     abilities:[ {name:"Плавание"},
  {name:"Атлетика"},
  {name:"Ориентирование"},
  {name:"Наблюдательность"},
  {name:"Самоконтроль"},
  {name:"Запугивание"},
  {name:"Интуиция"},
  {name:"Рукопашный бой"},
  {name:"Скрытность"},
  {name:"Координация"},
  {name:"Знание Верхнего Мира"},
  {name:"Детект менджик"},
  {name:"Системы безопасности"},
  {name:"Токсикология"},
  {name:"Расследование"},
  {name:"Информационная безопасность"},
  {name:"Владение клинковым оружием"},
  {name:"Владение древковым оружием"},
  {name:"Владение метательным/стрелковым оружием"},
  {name:"Владение огнестрельным оружием"},
  {name:"Воровство"},
  {name:"Боевые искусства"},
  {name:"Маскировка"},
  {name:"Вождение авто/мото техники"},
  {name:"Первая помощь"},
  {name:"Сопротивление боли"},
  {name:"Сопротивление магии"},
  {name:"Выживание"},
  {name:"Сопротивление ментальному давлению"},
  {name:"Ведение допросов"},
  {name:"Пытки и казни"},
  {name:"Хладнокровие"},
  {name:"Определение Магии"},
  {name:"Владение магическими проводниками"}]},
    {name:"Синий факультет",      color:"#3b82f6", teacher:"Синий",
   abilities:[  {name:"Общая эрудиция"},
  {name:"Наблюдательность"},
  {name:"Языки"},
  {name:"Эмпатия"},
  {name:"Самоконтроль"},
  {name:"Убеждение"},
  {name:"Обман"},
  {name:"Исполнение"},
  {name:"Интуиция"},
  {name:"Кулинария"},
  {name:"Координация"},
  {name:"Знание Верхнего Мира"},
  {name:"Манипуляция"},
  {name:"Этикет"},
  {name:"Актерское мастерство"},
  {name:"Политология"},
  {name:"Риторика"},
  {name:"Танец"},
  {name:"Секс"},
  {name:"Массаж"},
  {name:"Сопротивление магии"},
  {name:"Сопротивление ментальному давлению"},
  {name:"Соблазнение"},
  {name:"Хладнокровие"},
  {name:"Актерское мастерство"},
  {name:"Внешний вид"},
  {name:"Владение магическими проводниками"},
  {name:"Ментальная магия"},
  {name:"Инфильтрация"},
  {name:"Агентурная сеть"}]},
    {name:"Зелёный факультет",    color:"#22c55e", teacher:"Зелёный",
  abilities:[ {name:"Анализ"},
  {name:"Самоконтроль"},
  {name:"Кулинария"},
  {name:"Координация"},
  {name:"Знание Верхнего Мира"},
  {name:"Медицина"},
  {name:"Токсикология"},
  {name:"Первая помощь"},
  {name:"Сопротивление магии"},
  {name:"Выживание"},
  {name:"Хладнокровие"},
  {name:"Концентрация"},
  {name:"Дрессировка"},
  {name:"Целительство"},
  {name:"Алхимия"},
  {name:"Магозоология"},
  {name:"Яды и противоядия"},
  {name:"Викка"},
  {name:"Владение магическими проводниками"}]},
    {name:"Фиолетовый факультет", color:"#a855f7", teacher:"Фиолетовый",
  abilities:[{name:"Исполнение"},
  {name:"Медитация"},
  {name:"Координация"},
  {name:"Детект менджик"},
  {name:"Криптография"},
  {name:"Риторика"},
  {name:"Юриспруденция"},
  {name:"Концентрация"},
  {name:"Определение Магии"},
  {name:"Ритуалистика"},
  {name:"Владение магическими проводниками"},
  {name:"Теория магии"},
  {name:"Даймонология"}]},
    {name:"Красный факультет",    color:"#ef4444", teacher:"Красный",
   abilities:[{name:"Общая эрудиция"},
  {name:"Электроника"},
  {name:"Наблюдательность"},
  {name:"Анализ"},
  {name:"Медитация"},
  {name:"Интуиция"},
  {name:"Знание Верхнего Мира"},
  {name:"Детект менджик"},
  {name:"Системы безопасности"},
  {name:"Big Data"},
  {name:"Программирование"},
  {name:"Информационная безопасность"},
  {name:"Хакинг"},
  {name:"Профайлинг"},
  {name:"Логические игры"},
  {name:"Криптография"},
  {name:"Дроны"},
  {name:"Вождение авто/мото техники"},
  {name:"Сопротивление боли"},
  {name:"Сопротивление магии"},
  {name:"Сопротивление ментальному давлению"},
  {name:"Концентрация"},
  {name:"Определение Магии"},
  {name:"Владение магическими проводниками"},
  {name:"Прорицание"}]},
        {name:"Бурый факультет",    color:"#ba6c2c", teacher:"Бурый",
   abilities:[{name:"Плавание"},
  {name:"Атлетика"},
  {name:"Ориентирование"},
  {name:"Запугивание"},
  {name:"Рукопашный бой"},
  {name:"Координация"},
  {name:"Тактика"},
  {name:"Инженерия"},
  {name:"Военные технологии"},
  {name:"Владение клинковым оружием"},
  {name:"Владение древковым оружием"},
  {name:"Владение метательным/стрелковым оружием"},
  {name:"Владение огнестрельным оружием"},
  {name:"Артиллерия"},
  {name:"Дроны"},
  {name:"Вождение летательных средств"},
  {name:"Боевые искусства"},
  {name:"Вождение авто/мото техники"},
  {name:"Вождение специальных средств"},
  {name:"Первая помощь"},
  {name:"Сопротивление магии"},
  {name:"Выживание"},
  {name:"Владение магическими проводниками"}]},
        {name:"Ртутный факультет",    color:"#b0b0b0", teacher:"Ртутный",
   abilities:[  {name:"Общая эрудиция"},
  {name:"Техника"},
  {name:"Электроника"},
  {name:"Анализ"},
  {name:"Самоконтроль"},
  {name:"Знание Верхнего Мира"},
  {name:"Детект менджик"},
  {name:"Системы безопасности"},
  {name:"Big Data"},
  {name:"Программирование"},
  {name:"Информационная безопасность"},
  {name:"Инженерия"},
  {name:"Сопротивление боли"},
  {name:"Сопротивление магии"},
  {name:"Сопротивление ментальному давлению"},
  {name:"Концентрация"},
  {name:"Артефактология"},
  {name:"Определение Магии"},
  {name:"Владение магическими проводниками"},
  {name:"Теория магии"},
  {name:"Матрицалогия"},
  {name:"Техномантия"}]},
    {name:"Незримый факультет",   color:"#6b7280", teacher:"Незримый",
   abilities:[]},
  ];


  const LANGUAGES = ["Русский","Английский","Немецкий","Французский","Испанский",
    "Латынь","ДревнеГреческий","Ангельский","Демонический","Японский","Жестовый","Азбука морзе"];



  // ── Создаём навыки/способности ──
  await Item.createDocuments(
    SKILLS_DATA.map(sk => ({
      name: sk.name, type: "ability", img: KK9_DEFAULTS.skillAbility,
      system: { description:"", linkedAttribute:sk.attr, die:4, modifier:-2, isBase:sk.base, category:sk.categ }
    })),
    { pack: "kk9.kk9-abilities" }
  );

  // Перестраиваем индекс для поиска id
  const abPack = game.packs.get("kk9.kk9-abilities");
  await abPack.getIndex();
  const abilityIndex = new Map(Array.from(abPack.index).map(i => [i.name, i._id]));

  // ── Создаём факультеты — ссылаемся на существующие ability по имени ──
  await Item.createDocuments(
    FACULTIES_DATA.map(fac => ({
      name: fac.name, type: "faculty", img: KK9_DEFAULTS.skillAbility,
      system: {
        description:"", color:fac.color, color_key:"", teacher:fac.teacher,
        abilities: fac.abilities
          .filter(ab => abilityIndex.has(ab.name))
          .map(ab => ({ name:ab.name, itemId:abilityIndex.get(ab.name), category:ab.cat||"" }))
      }
    })),
    { pack: "kk9.kk9-faculties" }
  );

  // ── Создаём языки ──
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
