// ============================================================
// КК9 — Листы v0.4
// ============================================================

import { FACULTIES } from "./faculties.mjs";

export class KK9CharacterSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "character"],
      template: "systems/kk9/templates/actors/character-sheet.hbs",
      width: 860,
      height: 720,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
      dragDrop: [{ dragSelector: ".item-list .item, .draggable-item", dropSelector: null }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.isGM   = game.user.isGM;

    context.attributeLabels = {
      agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия"
    };

    context.skillLabels = {
      athletics:"Атлетика", notice:"Внимание", stealth:"Скрытность",
      persuasion:"Убеждение", fighting:"Рукопашный бой",
      deception:"Обман", navigation:"Ориентирование на местности",
      memory:"Память", knowledge:"Знания",
      intimidation:"Запугивание", survival:"Выживание", driving:"Вождение"
    };

    // Факультет
    const fKey = context.system.faculty;
    context.currentFaculty = fKey ? FACULTIES[fKey] : null;
    context.facultySkills  = context.system.facultySkills || [];

    // Предметы по типам
    context.artifacts   = this.actor.items.filter(i => i.type === "artifact");
    context.spells      = this.actor.items.filter(i => i.type === "spell");
    context.demons      = this.actor.items.filter(i => i.type === "demon");
    context.abilities   = this.actor.items.filter(i => i.type === "ability" && i.system.category !== "magic");
    context.magicItems  = this.actor.items.filter(i => i.type === "ability" && i.system.category === "magic");
    context.companions  = this.actor.items.filter(i => i.type === "companion" && ["pet","device","other"].includes(i.system.companion_type));
    context.vehicles    = this.actor.items.filter(i => i.type === "companion" && i.system.companion_type === "vehicle");
    context.languages   = this.actor.items.filter(i => i.type === "language");

    // Метки здоровья
    context.healthLabels = ["Здоров","Царапина","Ранен","Тяжело ранен","Критически","Без сознания"];
    context.physLabel    = context.healthLabels[context.system.health.physical.value] || "Здоров";
    context.mentLabel    = context.healthLabels[context.system.health.mental.value]   || "Стабилен";

    // Уровни магических талантов
    context.talentLevels = [
      { value: "weak",        label: "Слабо" },
      { value: "strong",      label: "Крепко" },
      { value: "exceptional", label: "Небывалый талант" }
    ];

    // Опции статуса связи
    context.relationStatusOptions = [
      { value:"ally",    label:"Союзник" },
      { value:"enemy",   label:"Враг" },
      { value:"neutral", label:"Нейтрал" },
      { value:"unknown", label:"Неизвестно" }
    ];

    return context;
  }

  // ---- Drag & Drop ----
  _onDragStart(event) {
    const el = event.currentTarget;
    // Стандартный drag для items
    if (el.dataset.itemId) {
      const item = this.actor.items.get(el.dataset.itemId);
      if (item) {
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
      }
    }
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }

    if (data.type !== "Item") return super._onDrop(event);

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const dropZone = event.currentTarget.closest("[data-drop-zone]")?.dataset.dropZone;

    // Дроп языка
    if (dropZone === "languages" && item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.itemId === item.id)) {
        await this.actor.update({
          "system.languages": [...langs, { name: item.name, itemId: item.id }]
        });
      }
      return;
    }

    // Дроп магического таланта
    if (dropZone === "magicTalents" && (item.type === "ability" || item.type === "spell")) {
      const talents = this.actor.system.magicTalents || [];
      if (!talents.find(t => t.itemId === item.id)) {
        await this.actor.update({
          "system.magicTalents": [...talents, { name: item.name, itemId: item.id, level: "weak" }]
        });
      }
      return;
    }

    // Дроп НПС в связи
    if (dropZone === "relations" && item.type === "Actor") {
      const relations = this.actor.system.relations || [];
      await this.actor.update({
        "system.relations": [...relations, { name: item.name, status: "neutral", level: 0, notes: "" }]
      });
      return;
    }

    // Стандартный дроп предмета
    return super._onDrop(event);
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this.isEditable) {
      // Связи
      html.find(".add-relation").click(this._onAddRelation.bind(this));
      html.find(".delete-relation").click(this._onDeleteRelation.bind(this));
      html.find(".relation-level-range").on("input", e => {
        e.currentTarget.closest(".relation-row").querySelector(".relation-level-val").textContent = e.currentTarget.value;
      });

      // Навыки
      html.find(".add-custom-skill").click(this._onAddCustomSkill.bind(this));
      html.find(".delete-custom-skill").click(this._onDeleteCustomSkill.bind(this));

      // Предметы
      html.find(".item-create").click(this._onItemCreate.bind(this));
      html.find(".item-delete").click(this._onItemDelete.bind(this));

      // Языки
      html.find(".delete-language").click(this._onDeleteLanguage.bind(this));

      // Магические таланты
      html.find(".delete-talent").click(this._onDeleteTalent.bind(this));

      // Жетоны судьбы — клик по пипу
      html.find(".bennie-pip").click(this._onBenniePipClick.bind(this));

      // Энергия
      html.find(".energy-pip").click(this._onEnergyPipClick.bind(this));
    }

    // Броски
    html.find(".rollable-attribute").click(e => this.actor.rollAttribute(e.currentTarget.dataset.attribute));
    html.find(".rollable-skill").click(e => this.actor.rollSkill(e.currentTarget.dataset.skill));
    html.find(".rollable-faculty-skill").click(e => this.actor.rollSkill(e.currentTarget.dataset.skill));
    html.find(".roll-initiative").click(() => this.actor.rollInitiative());
    html.find(".roll-toughness").click(() => this.actor.rollToughness());

    // Здоровье
    html.find(".health-pip[data-track='physical']").click(this._onPhysicalPipClick.bind(this));
    html.find(".health-pip[data-track='mental']").click(this._onMentalPipClick.bind(this));

    // Открыть предмет
    html.find(".item-name-click").click(e => {
      const id = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (id) this.actor.items.get(id)?.sheet.render(true);
    });
  }

  // ---- Жетоны судьбы ----
  async _onBenniePipClick(event) {
    const idx = parseInt(event.currentTarget.dataset.index); // 1-9
    const cur = this.actor.system.bennies;
    // Клик на последний заполненный — уменьшает. Клик на пустой — увеличивает.
    const newVal = idx <= cur ? idx - 1 : idx;
    await this.actor.update({ "system.bennies": Math.max(0, Math.min(9, newVal)) });
  }

  // ---- Энергия ----
  async _onEnergyPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.energy.value;
    await this.actor.update({ "system.energy.value": val === cur ? val - 1 : val });
  }

  // ---- Физическое здоровье ----
  async _onPhysicalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.physical.value;
    await this.actor.update({ "system.health.physical.value": val === cur ? val - 1 : val });
  }

  // ---- Ментальное здоровье ----
  async _onMentalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.mental.value;
    await this.actor.update({ "system.health.mental.value": val === cur ? val - 1 : val });
  }

  // ---- Связи ----
  async _onAddRelation(event) {
    event.preventDefault();
    const relations = this.actor.system.relations || [];
    await this.actor.update({ "system.relations": [...relations, { name:"", status:"neutral", level:0, notes:"" }] });
  }

  async _onDeleteRelation(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const rel = [...(this.actor.system.relations || [])];
    rel.splice(idx, 1);
    await this.actor.update({ "system.relations": rel });
  }

  // ---- Навыки ----
  async _onAddCustomSkill(event) {
    event.preventDefault();
    const cs = this.actor.system.customSkills || [];
    await this.actor.update({ "system.customSkills": [...cs, { name:"Новый навык", die:4, linkedAttribute:"smarts", modifier:0 }] });
  }

  async _onDeleteCustomSkill(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const cs  = [...(this.actor.system.customSkills || [])];
    cs.splice(idx, 1);
    await this.actor.update({ "system.customSkills": cs });
  }

  // ---- Языки ----
  async _onDeleteLanguage(event) {
    event.preventDefault();
    const idx  = parseInt(event.currentTarget.dataset.index);
    const list = [...(this.actor.system.languages || [])];
    list.splice(idx, 1);
    await this.actor.update({ "system.languages": list });
  }

  // ---- Магические таланты ----
  async _onDeleteTalent(event) {
    event.preventDefault();
    const idx     = parseInt(event.currentTarget.dataset.index);
    const talents = [...(this.actor.system.magicTalents || [])];
    talents.splice(idx, 1);
    await this.actor.update({ "system.magicTalents": talents });
  }

  // ---- Предметы ----
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const names = { artifact:"Артефакт", spell:"Заклинание", demon:"Демон", ability:"Абилка", companion:"Спутник", language:"Язык" };
    await Item.create({ name:`Новый ${names[type]||type}`, type }, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
    if (id) await this.actor.items.get(id)?.delete();
  }
}

// ---- НПС листы ----

export class KK9NpcLightSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-light"],
      template: "systems/kk9/templates/actors/npc-light-sheet.hbs",
      width: 480, height: 360
    });
  }
  getData() { const c = super.getData(); c.system = c.data.system; return c; }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-die").click(async () => {
      const roll = new Roll(`1d${this.actor.system.die}`);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong>` });
    });
  }
}

export class KK9NpcHardSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-hard"],
      template: "systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width: 620, height: 680,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }]
    });
  }
  getData() {
    const c = super.getData(); c.system = c.data.system;
    c.attributeLabels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    return c;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-attribute").click(e => this.actor.rollAttribute(e.currentTarget.dataset.attribute));
  }
}

export class KK9NpcBossSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-boss"],
      template: "systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width: 540, height: 480
    });
  }
  getData() { const c = super.getData(); c.system = c.data.system; return c; }
}

export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","item"],
      width: 520, height: 480,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"description" }]
    });
  }
  get template() { return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`; }
  getData() {
    const c = super.getData(); c.system = c.data.system;
    c.rarityOptions = [
      { value:"common", label:"Обычный" }, { value:"uncommon", label:"Необычный" },
      { value:"rare", label:"Редкий" }, { value:"unique", label:"Уникальный" }
    ];
    return c;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".roll-damage").click(() => this.item.rollDamage());
  }
}
