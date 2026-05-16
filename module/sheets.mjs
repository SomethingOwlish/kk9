// ============================================================
// КК9 — Классы листов
// ============================================================

import { FACULTIES } from "./faculties.mjs";

export class KK9CharacterSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "character"],
      template: "systems/kk9/templates/actors/character-sheet.hbs",
      width: 780,
      height: 680,
      tabs: [
        { navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }
      ],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.flags  = context.data.flags;

    context.attributeLabels = {
      agility:  "Ловкость",
      smarts:   "Смекалка",
      spirit:   "Дух",
      strength: "Сила",
      vigor:    "Живучесть"
    };

    // Текущий факультет
    const facultyKey = context.system.faculty;
    context.currentFaculty = facultyKey ? FACULTIES[facultyKey] : null;
    context.facultySkills  = context.system.facultySkills || [];

    context.skillLabels = {
      athletics: "Атлетика", notice: "Внимание", stealth: "Скрытность",
      persuasion: "Убеждение", fighting: "Рукопашный бой", shooting: "Стрельба",
      magic: "Магия", occult: "Оккультизм", investigation: "Расследование",
      intimidation: "Запугивание", survival: "Выживание", driving: "Вождение",
      hacking: "Взлом", ritual: "Ритуалистика"
    };

    // Предметы по типам
    context.artifacts  = this.actor.items.filter(i => i.type === "artifact");
    context.spells     = this.actor.items.filter(i => i.type === "spell");
    context.demons     = this.actor.items.filter(i => i.type === "demon");
    context.abilities  = this.actor.items.filter(i => i.type === "ability");
    context.companions = this.actor.items.filter(i => i.type === "companion");

    // Метки здоровья
    context.healthLabels = ["Здоров","Царапина","Ранен","Тяжело ранен","Критически","Без сознания"];
    context.healthLabel  = context.healthLabels[context.system.health.physical.value] || "Здоров";

    // Опции факультетов
    context.facultyOptions = [
      { value: "",          label: "— не выбран —" },
      { value: "white",     label: "Белый" },
      { value: "black",     label: "Чёрный" },
      { value: "blue",      label: "Синий" },
      { value: "green",     label: "Зелёный" },
      { value: "purple",    label: "Фиолетовый" },
      { value: "red",       label: "Красный" },
      { value: "brown",     label: "Бурый" },
      { value: "mercury",   label: "Ртутный" },
      { value: "invisible", label: "Незримый" }
    ];

    // Опции статуса связи
    context.relationStatusOptions = [
      { value: "ally",    label: "Союзник" },
      { value: "enemy",   label: "Враг" },
      { value: "neutral", label: "Нейтрал" },
      { value: "unknown", label: "Неизвестно" }
    ];

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this.isEditable) {
      html.find(".add-relation").click(this._onAddRelation.bind(this));
      html.find(".delete-relation").click(this._onDeleteRelation.bind(this));
      html.find(".add-custom-skill").click(this._onAddCustomSkill.bind(this));
      html.find(".delete-custom-skill").click(this._onDeleteCustomSkill.bind(this));
      html.find(".item-create").click(this._onItemCreate.bind(this));
      html.find(".item-delete").click(this._onItemDelete.bind(this));
      html.find(".item-edit").click(this._onItemEdit.bind(this));

      // Обновление слайдера уровня связи в реальном времени
      html.find(".relation-level-range").on("input", (e) => {
        const val = e.currentTarget.value;
        e.currentTarget.closest(".relation-row").querySelector(".relation-level-val").textContent = val;
      });
    }

    html.find(".rollable-attribute").click(this._onRollAttribute.bind(this));
    html.find(".rollable-skill").click(this._onRollSkill.bind(this));
    html.find(".rollable-faculty-skill").click(this._onRollFacultySkill.bind(this));
    html.find(".health-pip").click(this._onHealthPipClick.bind(this));
  }

  async _onRollAttribute(event) {
    event.preventDefault();
    await this.actor.rollAttribute(event.currentTarget.dataset.attribute);
  }

  async _onRollSkill(event) {
    event.preventDefault();
    await this.actor.rollSkill(event.currentTarget.dataset.skill);
  }

  async _onRollFacultySkill(event) {
    event.preventDefault();
    const skillName = event.currentTarget.dataset.skill;
    await this.actor.rollSkill(skillName);
  }

  async _onHealthPipClick(event) {
    event.preventDefault();
    const clickedValue = parseInt(event.currentTarget.dataset.value);
    const current = this.actor.system.health.physical.value;
    const newValue = clickedValue === current ? current - 1 : clickedValue;
    await this.actor.update({ "system.health.physical.value": Math.max(0, newValue) });
  }

  async _onAddRelation(event) {
    event.preventDefault();
    const relations = this.actor.system.relations || [];
    await this.actor.update({
      "system.relations": [...relations, { name: "", status: "neutral", level: 0, notes: "" }]
    });
  }

  async _onDeleteRelation(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index);
    const relations = [...(this.actor.system.relations || [])];
    relations.splice(index, 1);
    await this.actor.update({ "system.relations": relations });
  }

  async _onAddCustomSkill(event) {
    event.preventDefault();
    const customSkills = this.actor.system.customSkills || [];
    await this.actor.update({
      "system.customSkills": [...customSkills, { name: "Новый навык", die: 4, linkedAttribute: "smarts", modifier: 0 }]
    });
  }

  async _onDeleteCustomSkill(event) {
    event.preventDefault();
    const index = parseInt(event.currentTarget.dataset.index);
    const customSkills = [...(this.actor.system.customSkills || [])];
    customSkills.splice(index, 1);
    await this.actor.update({ "system.customSkills": customSkills });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const typeLabels = {
      artifact: "Артефакт", spell: "Заклинание", demon: "Призывной демон",
      ability: "Абилка", companion: "Спутник"
    };
    await Item.create({ name: `Новый ${typeLabels[type] || type}`, type }, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) await item.delete();
  }

  async _onItemEdit(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) item.sheet.render(true);
  }
}

// ---- Листы НПС ----

export class KK9NpcLightSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-light"],
      template: "systems/kk9/templates/actors/npc-light-sheet.hbs",
      width: 480, height: 360
    });
  }
  getData() {
    const context = super.getData();
    context.system = context.data.system;
    return context;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-die").click(async () => {
      const die = this.actor.system.die;
      const roll = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong>` });
    });
  }
}

export class KK9NpcHardSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-hard"],
      template: "systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width: 620, height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }
  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.attributeLabels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", vigor:"Живучесть" };
    return context;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-attribute").click(async (e) => await this.actor.rollAttribute(e.currentTarget.dataset.attribute));
    html.find(".rollable-skill").click(async (e) => await this.actor.rollSkill(e.currentTarget.dataset.skill));
  }
}

export class KK9NpcBossSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-boss"],
      template: "systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width: 540, height: 480
    });
  }
  getData() {
    const context = super.getData();
    context.system = context.data.system;
    return context;
  }
}

export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "item"],
      width: 520, height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }
  get template() {
    return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`;
  }
  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.rarityOptions = [
      { value: "common", label: "Обычный" }, { value: "uncommon", label: "Необычный" },
      { value: "rare", label: "Редкий" }, { value: "unique", label: "Уникальный" }
    ];
    return context;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".roll-damage").click(async () => await this.item.rollDamage());
  }
}
