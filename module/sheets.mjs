// ============================================================
// КК9 — Классы листов (Sheet classes)
// Sheet = окно карточки в Foundry. Каждый тип актёра/предмета
// имеет свой класс листа, который управляет шаблоном и событиями.
// ============================================================

/**
 * Лист персонажа игрока
 */
export class KK9CharacterSheet extends ActorSheet {

  /** Размер окна по умолчанию */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "character"],
      template: "systems/kk9/templates/actors/character-sheet.hbs",
      width: 720,
      height: 800,
      tabs: [
        { navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }
      ],
      dragDrop: [{ dragSelector: ".item-list .item", dropSelector: null }]
    });
  }

  /**
   * getData() — подготавливает данные для шаблона Handlebars.
   * Всё что возвращает этот метод, доступно в .hbs файле через {{переменная}}
   */
  getData() {
    const context = super.getData();
    const actorData = context.data;

    // Передаём системные данные прямо в корень контекста для удобства в шаблоне
    context.system = actorData.system;
    context.flags = actorData.flags;

    // Локализованные названия атрибутов для отображения
    context.attributeLabels = {
      agility:  game.i18n.localize("KK9.attributes.agility"),
      smarts:   game.i18n.localize("KK9.attributes.smarts"),
      spirit:   game.i18n.localize("KK9.attributes.spirit"),
      strength: game.i18n.localize("KK9.attributes.strength"),
      vigor:    game.i18n.localize("KK9.attributes.vigor"),
    };

    // Группируем предметы по типу для удобного отображения
    context.artifacts = this.actor.items.filter(i => i.type === "artifact");
    context.spells    = this.actor.items.filter(i => i.type === "spell");
    context.demons    = this.actor.items.filter(i => i.type === "demon");
    context.abilities = this.actor.items.filter(i => i.type === "ability");
    context.companions = this.actor.items.filter(i => i.type === "companion");

    // Метки степеней физического урона
    context.healthLabels = [
      "Здоров", "Царапина", "Ранен", "Тяжело ранен", "Критически", "Без сознания"
    ];
    context.healthLabel = context.healthLabels[context.system.health.physical.value] || "Здоров";

    // Варианты кубиков для выпадающих списков
    context.diceOptions = [4, 6, 8, 10, 12, 20].map(d => ({
      value: d,
      label: `d${d}`,
      selected: false
    }));

    // Факультеты
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

    // Варианты статуса связи с НПС
    context.relationStatusOptions = [
      { value: "ally",    label: game.i18n.localize("KK9.relations.ally") },
      { value: "enemy",   label: game.i18n.localize("KK9.relations.enemy") },
      { value: "neutral", label: game.i18n.localize("KK9.relations.neutral") },
      { value: "unknown", label: game.i18n.localize("KK9.relations.unknown") }
    ];

    return context;
  }

  /**
   * activateListeners() — подключает обработчики кликов и событий.
   * Вызывается после рендера шаблона.
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Только для редактируемых листов (не просмотр)
    if (this.isEditable) {
      // Добавить связь с НПС
      html.find(".add-relation").click(this._onAddRelation.bind(this));
      // Удалить связь с НПС
      html.find(".delete-relation").click(this._onDeleteRelation.bind(this));
      // Добавить кастомный скилл
      html.find(".add-custom-skill").click(this._onAddCustomSkill.bind(this));
      // Удалить кастомный скилл
      html.find(".delete-custom-skill").click(this._onDeleteCustomSkill.bind(this));
      // Создать предмет (артефакт, заклинание и т.д.)
      html.find(".item-create").click(this._onItemCreate.bind(this));
      // Удалить предмет
      html.find(".item-delete").click(this._onItemDelete.bind(this));
      // Редактировать предмет (открыть его карточку)
      html.find(".item-edit").click(this._onItemEdit.bind(this));
    }

    // Клики для броска атрибута (работают даже в режиме просмотра)
    html.find(".rollable-attribute").click(this._onRollAttribute.bind(this));
    // Клики для броска скилла
    html.find(".rollable-skill").click(this._onRollSkill.bind(this));
    // Изменить степень физического урона
    html.find(".health-pip").click(this._onHealthPipClick.bind(this));
  }

  // --- Обработчики бросков ---

  async _onRollAttribute(event) {
    event.preventDefault();
    const attrName = event.currentTarget.dataset.attribute;
    await this.actor.rollAttribute(attrName);
  }

  async _onRollSkill(event) {
    event.preventDefault();
    const skillName = event.currentTarget.dataset.skill;
    await this.actor.rollSkill(skillName);
  }

  // --- Обработчики здоровья ---

  async _onHealthPipClick(event) {
    event.preventDefault();
    const pip = event.currentTarget;
    const clickedValue = parseInt(pip.dataset.value);
    const current = this.actor.system.health.physical.value;
    // Клик на текущее значение — уменьшает на 1 (лечение)
    const newValue = clickedValue === current ? current - 1 : clickedValue;
    await this.actor.update({ "system.health.physical.value": Math.max(0, newValue) });
  }

  // --- Обработчики связей с НПС ---

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

  // --- Обработчики кастомных скиллов ---

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

  // --- Обработчики предметов ---

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const itemData = {
      name: `Новый ${game.i18n.localize(`KK9.item.types.${type}`) || type}`,
      type: type
    };
    await Item.create(itemData, { parent: this.actor });
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

/**
 * Лист лёгкого НПС — упрощённый
 */
export class KK9NpcLightSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-light"],
      template: "systems/kk9/templates/actors/npc-light-sheet.hbs",
      width: 480,
      height: 360,
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-die").click(async (event) => {
      const die = this.actor.system.die;
      const roll = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `<strong>${this.actor.name}</strong> бросает`
      });
    });
  }
}

/**
 * Лист сложного НПС
 */
export class KK9NpcHardSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-hard"],
      template: "systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width: 620,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.attributeLabels = {
      agility: game.i18n.localize("KK9.attributes.agility"),
      smarts:  game.i18n.localize("KK9.attributes.smarts"),
      spirit:  game.i18n.localize("KK9.attributes.spirit"),
      strength:game.i18n.localize("KK9.attributes.strength"),
      vigor:   game.i18n.localize("KK9.attributes.vigor"),
    };
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-attribute").click(this._onRollAttribute.bind(this));
    html.find(".rollable-skill").click(this._onRollSkill.bind(this));
  }

  async _onRollAttribute(event) {
    event.preventDefault();
    await this.actor.rollAttribute(event.currentTarget.dataset.attribute);
  }

  async _onRollSkill(event) {
    event.preventDefault();
    await this.actor.rollSkill(event.currentTarget.dataset.skill);
  }
}

/**
 * Лист босса / непобедимого НПС
 */
export class KK9NpcBossSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-boss"],
      template: "systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width: 540,
      height: 480,
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    return context;
  }
}

/**
 * Лист предмета (общий для всех типов Item)
 * В getData() определяем тип и передаём нужный шаблон
 */
export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "item"],
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    });
  }

  get template() {
    return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.itemType = this.item.type;

    // Варианты редкости для артефактов
    context.rarityOptions = [
      { value: "common",   label: "Обычный" },
      { value: "uncommon", label: "Необычный" },
      { value: "rare",     label: "Редкий" },
      { value: "unique",   label: "Уникальный" }
    ];

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Бросок урона предмета
    html.find(".roll-damage").click(async () => {
      await this.item.rollDamage();
    });
  }
}
