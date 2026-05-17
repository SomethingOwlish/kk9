// ============================================================
// КК9 — Листы v0.6
// ============================================================

export class KK9CharacterSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "character"],
      template: "systems/kk9/templates/actors/character-sheet.hbs",
      width: 860, height: 720,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }],
      dragDrop: [{ dragSelector: null, dropSelector: null }]
    });
  }

  async _render(force, options) {
    const pack = game.packs.get("kk9.kk9-faculties");
    if (pack && !pack.indexed) await pack.getIndex();
    return super._render(force, options);
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.isGM = game.user.isGM;

    context.attributeLabels = {
      agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия"
    };
    // Атрибуты для подсказок в навыках
    context.attrLabels = {
      agility:"Ловк", smarts:"Смек", spirit:"Дух", strength:"Сила", magic:"Магия"
    };

    // Навыки и способности
    const allSkills    = this.actor.items.filter(i => i.type === "skill");
    const allAbilities = this.actor.items.filter(i => i.type === "ability");

    // Максимальные кубики атрибутов для валидации
    context.attrDice = {
      agility:  context.system.attributes.agility.die,
      smarts:   context.system.attributes.smarts.die,
      spirit:   context.system.attributes.spirit.die,
      strength: context.system.attributes.strength.die,
      magic:    context.system.attributes.magic.die,
    };
    context.categoryLabels = {
      common:"Общая", personal:"Личная", learned:"Изучаемая", magic:"Магическая"
    };

    // Хелпер для шаблона
    context.categoryLabel = (cat) =>
      ({common:"Общая",personal:"Личная",learned:"Изучаемая",magic:"Магическая"})[cat] || cat;

    // Факультет
    const facultyId = context.system.faculty;
    // faculty item ищем в индексе компендиума (синхронно)
    let facultyItem = null;
    if (facultyId) {
      const pack = game.packs.get("kk9.kk9-faculties");
      if (pack) facultyItem = pack.get(facultyId) ?? null;
      if (!facultyItem) facultyItem = game.items?.get(facultyId) ?? null;
    }
    context.facultyItem  = facultyItem;
    context.facultyColor = context.system.faculty_color || "#888888";
    context.facultyName  = context.system.faculty_name || facultyItem?.name || "";

    // Имена навыков факультета
    let facultyAbilityNames = new Set();
    if (facultyItem) {
      (facultyItem.system.abilities || []).forEach(a => facultyAbilityNames.add(a.name));
    }

    // Факультетские: ability с faculty_id ИЛИ любой item с именем из списка факультета
    const facultyItems = [
      ...allAbilities.filter(i =>
        (facultyId && i.system.faculty_id === facultyId) ||
        (i.system.category === "common" && facultyAbilityNames.has(i.name))
      ),
      ...allSkills.filter(i => facultyAbilityNames.has(i.name))
    ];
    context.facultyAbilities = facultyItems;
    const facultyAbilityIds = new Set(facultyItems.map(i => i.id));
    context.magicAbilities = allAbilities.filter(i =>
      i.system.category === "magic" && !facultyAbilityIds.has(i.id)
    );

    // Навыки — исключаем те что уже в faculty блоке
    context.baseSkills = allSkills.filter(i => !facultyAbilityIds.has(i.id));

    // common/learned НЕ в факультетском блоке → в основных навыках
    const commonAbilities = allAbilities.filter(i =>
      ["common","learned"].includes(i.system.category) &&
      !facultyAbilityIds.has(i.id)
    );
    context.baseSkills = [...context.baseSkills, ...commonAbilities];

    // personal → всегда в индивидуальных, никогда не двигаются
    context.personalAbilities = allAbilities.filter(i =>
      i.system.category === "personal"
    );

    // Карта уровней магических способностей {itemId: level}
    const magicLevelMap = {};
    for (const ml of (context.system.magicLevels || [])) {
      magicLevelMap[ml.itemId] = ml.level;
    }
    context.magicLevelMap = magicLevelMap;

    // Снаряжение
    context.weapons    = this.actor.items.filter(i => i.type === "weapon");
    context.gear       = this.actor.items.filter(i => i.type === "gear");
    context.artifacts  = this.actor.items.filter(i => i.type === "artifact");
    context.spells     = this.actor.items.filter(i => i.type === "spell");
    context.daemons    = this.actor.items.filter(i => i.type === "daemon");
    context.companions = this.actor.items.filter(i => i.type === "companion");
    context.vehicles   = this.actor.items.filter(i => i.type === "vehicle");
    context.devices    = this.actor.items.filter(i => i.type === "device");

    // Контакты — в связях
    context.contacts = this.actor.items.filter(i => i.type === "contact");

    // Языки
    context.languageItems = this.actor.items.filter(i => i.type === "language");

    return context;
  }

  // ---- Drag & Drop ----
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }

    // Актёр → связи
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      const relations = this.actor.system.relations || [];
      if (!relations.find(r => r.name === actor.name)) {
        await this.actor.update({
          "system.relations": [...relations, {
            name:actor.name, status:"neutral", level:0,
            notes: actor.type==="character" ? "Игровой персонаж" : "",
            love:false
          }]
        });
      }
      return;
    }

    if (data.type !== "Item") return super._onDrop(event);

    const item = await fromUuid(data.uuid);
    if (!item) return;

    // Faculty → применяем факультет
    if (item.type === "faculty") {
      await this.actor._applyFaculty(item);
      return;
    }

    // Language → список языков
    if (item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.name === item.name)) {
        await this.actor.update({
          "system.languages": [...langs, { name:item.name, itemId:item.id }]
        });
      }
      return;
    }

    // Skill → добавляем навык на персонажа
    if (item.type === "skill") {
      const existing = this.actor.items.find(i => i.type === "skill" && i.name === item.name);
      if (existing) {
        ui.notifications.warn(`Навык "${item.name}" уже есть на карточке.`);
        return;
      }
      // Создаём копию навыка на персонаже
      const itemData = item.toObject();
      itemData.system.isBase = true;
      await Item.create(itemData, { parent: this.actor });
      return;
    }

    // Contact, weapon, gear, artifact, spell, daemon, companion, vehicle, device
    // → стандартный дроп (создаёт копию item на персонаже)
    const standardTypes = ["contact","weapon","gear","artifact","spell","daemon","companion","vehicle","device"];
    if (standardTypes.includes(item.type)) {
      return super._onDrop(event);
    }

    // Ability → создаём копию на персонаже
    if (item.type === "ability") {
      const existing = this.actor.items.find(i => i.type === "ability" && i.name === item.name);
      if (existing) {
        ui.notifications.warn(`Способность "${item.name}" уже есть на карточке.`);
        return;
      }
      // common abilities получают faculty_id если имя совпадает с текущим факультетом
      const itemData = item.toObject();
      if (item.system.category === "common") {
        const facultyId = this.actor.system.faculty;
        if (facultyId) {
          const facultyItem = this.actor.items.get(facultyId) ?? game.items?.get(facultyId);
          // Ищем faculty в компендиуме если нет в мире
          if (!facultyItem) {
            const pack = game.packs.get("kk9.kk9-faculties");
            if (pack) {
              await pack.getIndex();
              const entry = Array.from(pack.index).find(i => i._id === facultyId);
              // Не устанавливаем faculty_id для common — они двигаются по имени
            }
          }
          // common всегда без faculty_id — визуальное перемещение по имени
          itemData.system.faculty_id = null;
        }
      }
      await Item.create(itemData, { parent: this.actor });
      return;
    }

    // Всё остальное — стандартный дроп
    return super._onDrop(event);
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this.isEditable) {
      // Связи
      html.find(".add-relation").click(this._onAddRelation.bind(this));
      html.find(".delete-relation").click(this._onDeleteRelation.bind(this));
      html.find(".love-toggle").click(this._onLoveToggle.bind(this));
      html.find(".relation-level-range").on("input", e => {
        e.currentTarget.closest(".relation-row").querySelector(".relation-level-val").textContent = e.currentTarget.value;
      });

      // Навыки
      html.find(".add-custom-skill").click(this._onAddCustomSkill.bind(this));
      html.find(".delete-custom-skill").click(this._onDeleteCustomSkill.bind(this));

      // Предметы
      html.find(".item-delete").click(this._onItemDelete.bind(this));
      html.find(".item-create").click(this._onItemCreate.bind(this));
      html.find(".delete-language").click(this._onDeleteLanguage.bind(this));

      // Жетоны и здоровье
      html.find(".bennie-pip").click(this._onBenniePipClick.bind(this));
      html.find(".health-pip[data-track='physical']").click(this._onPhysicalPipClick.bind(this));
      html.find(".health-pip[data-track='mental']").click(this._onMentalPipClick.bind(this));

      // Кубик способности изменился → сохраняем в item
      html.find(".ability-die-select").on("change", this._onAbilityDieChange.bind(this));
      html.find(".ability-mod-input").on("change", this._onAbilityModChange.bind(this));

      // Кубик навыка изменился → проверяем ограничение
      html.find(".skill-die-select").on("change", this._onSkillDieChange.bind(this));
      html.find(".skill-mod-input").on("change", this._onSkillModChange.bind(this));

      // Факультет меняется только перетаскиванием faculty item

      // Уровень магической способности
      html.find(".magic-level-select").on("change", this._onMagicLevelChange.bind(this));
    }

    // Броски
    html.find(".rollable-attribute").click(e => this.actor.rollAttribute(e.currentTarget.dataset.attribute));
    html.find(".rollable-skill").click(e => this.actor.rollSkillItem(e.currentTarget.dataset.itemId));
    html.find(".rollable-ability").click(e => this.actor.rollAbility(e.currentTarget.dataset.itemId));
    html.find(".roll-initiative").click(() => this.actor.rollInitiative());
    html.find(".roll-toughness").click(() => this.actor.rollToughness());

    // Здоровье
    html.find(".health-pip[data-track='physical']").click(this._onPhysicalPipClick.bind(this));
    html.find(".health-pip[data-track='mental']").click(this._onMentalPipClick.bind(this));

    // Открыть предмет
    html.find(".item-name-click, .item-img").click(e => {
      const row = e.currentTarget.closest("[data-item-id]");
      if (!row) return;
      this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
    });
  }

  // ---- Способности ----

  async _onSkillDieChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const die = parseInt(event.currentTarget.value);
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Проверяем ограничение: кубик навыка ≤ кубик связанного атрибута
    const linkedAttr = item.system.linkedAttribute;
    const attrDie = this.actor.system.attributes?.[linkedAttr]?.die || 20;

    if (die > attrDie) {
      ui.notifications.warn(
        `Кубик навыка "${item.name}" не может превышать кубик ${
          {agility:"Ловкости",smarts:"Смекалки",spirit:"Духа",strength:"Силы",magic:"Магии"}[linkedAttr]
        } (d${attrDie}).`
      );
      // Сбрасываем select обратно
      event.currentTarget.value = item.system.die;
      return;
    }

    await item.update({ "system.die": die });
  }

  async _onSkillModChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const mod = parseInt(event.currentTarget.value) || 0;
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.modifier": mod });
  }

  async _onAbilityDieChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const die = parseInt(event.currentTarget.value);
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.die": die });
  }

  async _onAbilityModChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const mod = parseInt(event.currentTarget.value) || 0;
    const item = this.actor.items.get(itemId);
    if (item) await item.update({ "system.modifier": mod });
  }

  async _onMagicLevelChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const level = event.currentTarget.value;
    const magicLevels = [...(this.actor.system.magicLevels || [])];
    const idx = magicLevels.findIndex(ml => ml.itemId === itemId);
    if (idx >= 0) magicLevels[idx].level = level;
    else magicLevels.push({ itemId, level });
    await this.actor.update({ "system.magicLevels": magicLevels });
  }

  // ---- Жетоны и здоровье ----

  async _onBenniePipClick(event) {
    const idx = parseInt(event.currentTarget.dataset.index);
    const cur = this.actor.system.bennies;
    await this.actor.update({ "system.bennies": idx <= cur ? idx-1 : idx });
  }

  async _onPhysicalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.physical.value;
    await this.actor.update({ "system.health.physical.value": val===cur ? val-1 : val });
  }

  async _onMentalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.mental.value;
    await this.actor.update({ "system.health.mental.value": val===cur ? val-1 : val });
  }

  // ---- Любовь ----
  async _onLoveToggle(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const relations = [...(this.actor.system.relations || [])];
    const wasLoved = relations[idx].love;
    relations.forEach(r => r.love = false);
    if (!wasLoved) relations[idx].love = true;
    await this.actor.update({ "system.relations": relations });
  }

  // ---- Связи ----
  async _onAddRelation(event) {
    event.preventDefault();
    const relations = this.actor.system.relations || [];
    await this.actor.update({ "system.relations": [...relations, { name:"", status:"neutral", level:0, notes:"", love:false }] });
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
    const cs = [...(this.actor.system.customSkills || [])];
    cs.splice(idx, 1);
    await this.actor.update({ "system.customSkills": cs });
  }

  // ---- Языки ----
  async _onDeleteLanguage(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const list = [...(this.actor.system.languages || [])];
    list.splice(idx, 1);
    await this.actor.update({ "system.languages": list });
  }

  // ---- Предметы ----
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const category = event.currentTarget.dataset.category;
    const names = {
      weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт",
      spell:"Заклинание", daemon:"Даймон", ability:"Способность",
      companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
      contact:"Контакт", language:"Язык"
    };
    const itemData = { name:`Новая ${names[type]||type}`, type };
    if (category) itemData["system.category"] = category;
    await Item.create(itemData, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const el = event.currentTarget;
    // Поддерживаем оба варианта data-атрибута
    const itemId = el.dataset.itemId || el.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;

    // Удаляем из magicLevels если была там
    const magicLevels = (this.actor.system.magicLevels || []).filter(ml => ml.itemId !== itemId);
    if (magicLevels.length !== (this.actor.system.magicLevels || []).length) {
      await this.actor.update({ "system.magicLevels": magicLevels });
    }

    await this.actor.items.get(itemId)?.delete();
  }
}

// ---- НПС листы ----

export class KK9NpcLightSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:["kk9","sheet","actor","npc-light"],
      template:"systems/kk9/templates/actors/npc-light-sheet.hbs",
      width:480, height:360
    });
  }
  getData() { const c=super.getData(); c.system=c.data.system; return c; }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-die").click(async () => {
      const roll = new Roll(`1d${this.actor.system.die}`);
      await roll.evaluate();
      await roll.toMessage({ speaker:ChatMessage.getSpeaker({actor:this.actor}), flavor:`<strong>${this.actor.name}</strong>` });
    });
  }
}

export class KK9NpcHardSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:["kk9","sheet","actor","npc-hard"],
      template:"systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width:620, height:680,
      tabs:[{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }]
    });
  }
  getData() {
    const c=super.getData(); c.system=c.data.system;
    c.attributeLabels={agility:"Ловкость",smarts:"Смекалка",spirit:"Дух",strength:"Сила",magic:"Магия"};
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
      classes:["kk9","sheet","actor","npc-boss"],
      template:"systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width:540, height:480
    });
  }
  getData() { const c=super.getData(); c.system=c.data.system; return c; }
}

// ---- Item лист ----

export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes:["kk9","sheet","item"],
      width:560, height:520,
      tabs:[{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"description" }],
      dragDrop:[{ dragSelector:null, dropSelector:".faculty-abilities-drop" }]
    });
  }

  get template() {
    return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.categoryOptions = [
      {value:"common",label:"Общая"},{value:"personal",label:"Личная"},
      {value:"learned",label:"Изучаемая"},{value:"magic",label:"Магическая"}
    ];
    context.rarityOptions = [
      {value:"common",label:"Обычный"},{value:"uncommon",label:"Необычный"},
      {value:"rare",label:"Редкий"},{value:"unique",label:"Уникальный"}
    ];
    context.vehicleTypeOptions = [
      {value:"ground",label:"Наземный"},{value:"air",label:"Воздушный"},
      {value:"water",label:"Водный"},{value:"magical",label:"Магический"},{value:"other",label:"Прочее"}
    ];
    context.orgTypeOptions = [
      {value:"academic",label:"Академическая"},{value:"criminal",label:"Криминальная"},
      {value:"government",label:"Правительственная"},{value:"magical",label:"Магическая"},
      {value:"corporate",label:"Корпоративная"},{value:"underground",label:"Подпольная"},
      {value:"other",label:"Прочая"}
    ];
    if (this.item.type === "faculty") {
      context.facultyAbilities = context.system.abilities || [];
    }
    return context;
  }

  // Дроп ability или skill на faculty sheet
  async _onDrop(event) {
    if (this.item.type !== "faculty") return super._onDrop(event);
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item) return;
    // Принимаем ability и skill
    if (!["ability","skill"].includes(item.type)) return;
    const abilities = [...(this.item.system.abilities || [])];
    if (!abilities.find(a => a.itemId === item.id)) {
      abilities.push({
        name: item.name,
        itemId: item.id,
        category: item.system.category || (item.type === "skill" ? "common" : "learned")
      });
      await this.item.update({ "system.abilities": abilities });
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".roll-damage").click(() => this.item.rollDamage());
    html.find(".remove-faculty-ability").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const abilities = [...(this.item.system.abilities||[])];
      abilities.splice(idx, 1);
      await this.item.update({ "system.abilities": abilities });
    });
  }
}
