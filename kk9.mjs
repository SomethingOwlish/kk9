// ============================================================
// КК9 — Главный файл v0.9.6
// ============================================================

import {
  CharacterDataModel, NpcLightDataModel, NpcHardDataModel, NpcBossDataModel,
  FacultyDataModel, SkillDataModel, AbilityDataModel, WeaponDataModel, GearDataModel,
  ArtifactDataModel, SpellDataModel, DaemonDataModel, CompanionDataModel,
  VehicleDataModel, DeviceDataModel, ContactDataModel, LanguageDataModel
} from "./module/data-models.mjs";

import { KK9Actor, KK9Item } from "./module/documents.mjs";

import {
  KK9CharacterSheet, KK9NpcLightSheet, KK9NpcHardSheet,
  KK9NpcBossSheet, KK9ItemSheet
} from "./module/sheets.mjs";

// ============================================================
// Дефолтные изображения системы КК9
// ============================================================
const KK9_DEFAULTS = {
  // Акторы и НПС — мистический коридор со свечой
  actor: "systems/kk9/media/actor-default.png",
  // Предметы (артефакты, оружие, снаряжение и т.д.)
  item: "systems/kk9/media/item-default.png",
  // Навыки и способности — руны на камне
  skillAbility: "systems/kk9/media/skill-default.png",
  // Фоновая картинка стартовой сцены
  sceneBg: "systems/kk9/media/scene-background.png",
};

// Типы items — навыки/способности
const SKILL_TYPES = new Set(["skill","ability","faculty","language"]);

Hooks.once("init", function () {
  console.log("КК9 | Инициализация v0.9.6");

  CONFIG.Actor.documentClass = KK9Actor;
  CONFIG.Item.documentClass  = KK9Item;

  // Дефолтные изображения через CONFIG
  CONFIG.Actor.defaultToken = KK9_DEFAULTS.actor;

  CONFIG.Actor.dataModels = {
    "character": CharacterDataModel,
    "npc-light": NpcLightDataModel,
    "npc-hard":  NpcHardDataModel,
    "npc-boss":  NpcBossDataModel
  };

  CONFIG.Item.dataModels = {
    "faculty":   FacultyDataModel,
    "skill":     SkillDataModel,
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

// ============================================================
// Хук preCreateActor — устанавливаем дефолтное изображение актора
// ============================================================
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  // Если изображение не задано или дефолтное Foundry — ставим наше
  const defaultFoundry = "icons/svg/mystery-man.svg";
  if (!data.img || data.img === defaultFoundry || data.img === CONST.DEFAULT_TOKEN) {
    actor.updateSource({ img: KK9_DEFAULTS.actor });
  }
  // Дефолтный токен-портрет
  if (!data.prototypeToken?.texture?.src || data.prototypeToken?.texture?.src === defaultFoundry) {
    actor.updateSource({ "prototypeToken.texture.src": KK9_DEFAULTS.actor });
  }
});

// ============================================================
// Хук preCreateItem — устанавливаем дефолтное изображение предмета
// ============================================================
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const defaultFoundry = "icons/svg/item-bag.svg";
  if (!data.img || data.img === defaultFoundry || data.img.startsWith("icons/svg/")) {
    const img = SKILL_TYPES.has(data.type) ? KK9_DEFAULTS.skillAbility : KK9_DEFAULTS.item;
    item.updateSource({ img });
  }
});

// ============================================================
// Хук createActor — базовые навыки + дефолтная картинка
// ============================================================
Hooks.on("createActor", async (actor, options, userId) => {
  if (game.userId !== userId) return;

  // Исправляем изображение если всё ещё дефолтное Foundry
  const badImgs = ["icons/svg/mystery-man.svg", "icons/svg/aura.svg", CONST.DEFAULT_TOKEN, ""];
  if (!actor.img || badImgs.includes(actor.img)) {
    await actor.update({ img: KK9_DEFAULTS.actor, "prototypeToken.texture.src": KK9_DEFAULTS.actor });
  }

  // Базовые навыки только для персонажа
  if (actor.type !== "character") return;

  const pack = game.packs.get("kk9.kk9-skills");
  if (!pack) return;

  await pack.getIndex();
  const skillDocs = await Promise.all(
    Array.from(pack.index).map(i => pack.getDocument(i._id))
  );

  const toCreate = skillDocs.filter(Boolean).map(s => {
    const data = s.toObject();
    data.system.isBase = true;
    return data;
  });

  if (toCreate.length) await Item.createDocuments(toCreate, { parent: actor });
});

// ============================================================
// Хук ready
// ============================================================
Hooks.once("ready", async function() {
  console.log("КК9 | Система готова");
  if (!game.user.isGM) return;
  await _ensureCompendiums();
  await _ensureStartScene();
});

// ============================================================
// Стартовая сцена — создаём если нет ни одной сцены
// ============================================================
async function _ensureStartScene() {
  if (game.scenes.size > 0) return; // сцены уже есть

  console.log("КК9 | Создаём стартовую сцену...");
  await Scene.create({
    name: "Кризисный Комитет №9",
    background: { src: KK9_DEFAULTS.sceneBg },
    width: 3840,
    height: 2160,
    grid: { type: 1, size: 100 },
    initial: { x: 1920, y: 1080, scale: 0.5 },
    active: true,
    navigation: true
  });
  ui.notifications.info("КК9 | Стартовая сцена создана.");
}

async function _ensureCompendiums() {
  const skillPack = game.packs.get("kk9.kk9-skills");
  if (!skillPack) { console.warn("КК9 | Компендиум навыков не найден"); return; }
  await skillPack.getIndex();
  if (skillPack.index.size > 0) return;

  console.log("КК9 | Наполняем компендиумы...");

  const packNames = ["kk9-skills","kk9-faculties","kk9-abilities","kk9-languages",
    "kk9-weapons","kk9-gear","kk9-artifacts","kk9-spells","kk9-daemons",
    "kk9-companions","kk9-vehicles","kk9-devices","kk9-contacts",
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
     abilities:[{name:"Пытки",cat:"learned"},{name:"Тактика",cat:"learned"},{name:"Стратегия",cat:"learned"},{name:"Владение мечом",cat:"learned"}]},
    {name:"Чёрный факультет",     color:"#555555", teacher:"Чёрный",
     abilities:[{name:"Выслеживание",cat:"learned"},{name:"Скрытность",cat:"learned"},{name:"Противостояние пыткам",cat:"learned"},{name:"Убийство",cat:"learned"}]},
    {name:"Синий факультет",      color:"#3b82f6", teacher:"Синий",
     abilities:[{name:"Соблазнение",cat:"learned"},{name:"Уговоры",cat:"learned"},{name:"Запугивание",cat:"learned"},{name:"Скрытность",cat:"learned"}]},
    {name:"Зелёный факультет",    color:"#22c55e", teacher:"Зелёный",
     abilities:[{name:"Яды",cat:"learned"},{name:"Противоядия",cat:"learned"},{name:"Исцеление",cat:"learned"}]},
    {name:"Фиолетовый факультет", color:"#a855f7", teacher:"Фиолетовый",
     abilities:[{name:"Палочковая магия",cat:"magic"},{name:"Концентрация",cat:"learned"},{name:"Зельеварение",cat:"learned"},{name:"Руны",cat:"magic"},{name:"Даймонология",cat:"magic"}]},
    {name:"Красный факультет",    color:"#ef4444", teacher:"Красный",
     abilities:[{name:"Аналитика",cat:"learned"},{name:"Прорицание",cat:"magic"},{name:"Тактика",cat:"learned"},{name:"Наблюдательность",cat:"learned"}]},
    {name:"Бурый факультет",      color:"#92400e", teacher:"Бурый",
     abilities:[{name:"Владение оружием ближнего боя",cat:"learned"},{name:"Стрельба",cat:"learned"},{name:"Стрельба из автоматического оружия",cat:"learned"},{name:"Выживание",cat:"learned"}]},
    {name:"Ртутный факультет",    color:"#94a3b8", teacher:"Ртутный",
     abilities:[{name:"Починка",cat:"learned"},{name:"Взлом техники",cat:"learned"},{name:"Управление дроном",cat:"learned"}]},
    {name:"Незримый факультет",   color:"#6b7280", teacher:"Незримый",
     abilities:[{name:"Бытие бесполезным мудаком",cat:"personal"}]},
  ];

  const LANGUAGES = ["Русский","Английский","Немецкий","Французский","Испанский",
    "Латынь","Древний","Магический","Демонический","Технический","Жестовый","Азбука морзе"];

  await Item.createDocuments(
    SKILLS_DATA.map(sk => ({
      name:sk.name, type:"skill", img: KK9_DEFAULTS.skillAbility,
      system:{description:"", linkedAttribute:sk.attr, die:4, modifier:-2, isBase:true}
    })),
    { pack:"kk9.kk9-skills" }
  );

  const abPack = game.packs.get("kk9.kk9-abilities");
  for (const fac of FACULTIES_DATA) {
    const abilityRefs = [];
    if (abPack) {
      for (const ab of fac.abilities) {
        const [created] = await Item.createDocuments([{
          name:ab.name, type:"ability", img: KK9_DEFAULTS.skillAbility,
          system:{description:"", category:ab.cat, faculty_id:null, die:4, modifier:-2}
        }], { pack:"kk9.kk9-abilities" });
        abilityRefs.push({name:ab.name, itemId:created.id, category:ab.cat});
      }
    }
    await Item.createDocuments([{
      name:fac.name, type:"faculty", img: KK9_DEFAULTS.skillAbility,
      system:{description:"", color:fac.color, color_key:"", teacher:fac.teacher, abilities:abilityRefs}
    }], { pack:"kk9.kk9-faculties" });
  }

  await Item.createDocuments(
    LANGUAGES.map(lang => ({name:lang, type:"language", img: KK9_DEFAULTS.skillAbility, system:{description:"",region:""}})),
    { pack:"kk9.kk9-languages" }
  );

  console.log("КК9 | Компендиумы заполнены!");
  ui.notifications.info("КК9 | Базовые данные загружены в компендиумы!");
}

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
    contact:"📇", language:"🗣", skill:"📖", ability:"⚡"
  })[type] || "📦");

  Handlebars.registerHelper("npcItemTypeLabel", (type) => ({
    weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание",
    daemon:"Даймон", companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
    contact:"Контакт", language:"Язык"
  })[type] || type);
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
    "systems/kk9/templates/items/faculty-sheet.hbs",
    "systems/kk9/templates/items/skill-sheet.hbs",
    "systems/kk9/templates/items/ability-sheet.hbs",
    "systems/kk9/templates/items/weapon-sheet.hbs",
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
