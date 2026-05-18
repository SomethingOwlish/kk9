// ============================================================
// КК9 — Листы v1.5
// ============================================================

// ============================================================
// ПЕРСОНАЖ
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
    context.attributeLabels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    context.attrLabels = { agility:"Ловк", smarts:"Смек", spirit:"Дух", strength:"Сила", magic:"Магия" };

    const allSkills    = this.actor.items.filter(i => i.type === "skill");
    const allAbilities = this.actor.items.filter(i => i.type === "ability");

    context.attrDice = {
      agility:  context.system.attributes.agility.die,
      smarts:   context.system.attributes.smarts.die,
      spirit:   context.system.attributes.spirit.die,
      strength: context.system.attributes.strength.die,
      magic:    context.system.attributes.magic.die,
    };
    context.categoryLabels = { common:"Общая", personal:"Личная", learned:"Изучаемая", magic:"Магическая" };
    context.categoryLabel  = (cat) => ({common:"Общая",personal:"Личная",learned:"Изучаемая",magic:"Магическая"})[cat] || cat;

    const facultyId = context.system.faculty;
    let facultyItem = null;
    if (facultyId) {
      const pack = game.packs.get("kk9.kk9-faculties");
      if (pack) facultyItem = pack.get(facultyId) ?? null;
      if (!facultyItem) facultyItem = game.items?.get(facultyId) ?? null;
    }
    context.facultyItem  = facultyItem;
    context.facultyColor = facultyItem?.system?.color || context.system.faculty_color || "#888888";
    context.facultyName  = facultyItem?.name || context.system.faculty_name || "";

    let facultyAbilityNames = new Set();
    if (facultyItem) (facultyItem.system.abilities || []).forEach(a => facultyAbilityNames.add(a.name));

    const facultyItems = facultyId ? [
      ...allAbilities.filter(i =>
        i.system.faculty_id === facultyId ||
        (i.system.category === "common" && facultyAbilityNames.has(i.name))
      ),
      ...allSkills.filter(i => facultyAbilityNames.has(i.name))
    ] : [];
    context.facultyAbilities = facultyItems;
    const facultyAbilityIds = new Set(facultyItems.map(i => i.id));

    context.magicAbilities = allAbilities.filter(i => i.system.category === "magic");

    context.baseSkills = allSkills.filter(i => !facultyAbilityIds.has(i.id));
    const commonAbilities = allAbilities.filter(i =>
      ["common","learned"].includes(i.system.category) && !facultyAbilityIds.has(i.id)
    );
    context.baseSkills = [...context.baseSkills, ...commonAbilities];
    context.personalAbilities = allAbilities.filter(i => i.system.category === "personal");

    const magicLevelMap = {};
    for (const ml of (context.system.magicLevels || [])) magicLevelMap[ml.itemId] = ml.level;
    context.magicLevelMap = magicLevelMap;

    context.weapons    = this.actor.items.filter(i => i.type === "weapon");
    context.gear       = this.actor.items.filter(i => i.type === "gear");
    context.artifacts  = this.actor.items.filter(i => i.type === "artifact");
    context.spells     = this.actor.items.filter(i => i.type === "spell");
    context.daemons    = this.actor.items.filter(i => i.type === "daemon");
    context.companions = this.actor.items.filter(i => i.type === "companion");
    context.vehicles   = this.actor.items.filter(i => i.type === "vehicle");
    context.devices    = this.actor.items.filter(i => i.type === "device");
    context.contacts   = this.actor.items.filter(i => i.type === "contact");
    context.languageItems = this.actor.items.filter(i => i.type === "language");
    return context;
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }

    // Статус на персонажа (drag-drop из айтемов)
    if (data.type === "Item") {
      const item = await fromUuid(data.uuid);
      if (item?.type === "status") {
        const { applyStatusToActor } = await import("./weapon-combat.mjs");
        await applyStatusToActor(this.actor, item);
        return;
      }
    }

    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      const relations = this.actor.system.relations || [];
      if (!relations.find(r => r.name === actor.name)) {
        await this.actor.update({ "system.relations": [...relations, {
          name: actor.name, status: "neutral", level: 0,
          notes: actor.type === "character" ? "Игровой персонаж" : "",
          love: false
        }] });
      }
      return;
    }
    if (data.type !== "Item") return super._onDrop(event);
    const item = await fromUuid(data.uuid);
    if (!item) return;
    if (item.type === "faculty") { await this.actor._applyFaculty(item); return; }
    if (item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.name === item.name))
        await this.actor.update({ "system.languages": [...langs, { name: item.name, itemId: item.id }] });
      return;
    }
    if (item.type === "skill") {
      const existing = this.actor.items.find(i => i.type === "skill" && i.name === item.name);
      if (existing) { ui.notifications.warn(`Навык "${item.name}" уже есть на карточке.`); return; }
      const itemData = item.toObject(); itemData.system.isBase = true;
      await Item.create(itemData, { parent: this.actor }); return;
    }
    const standardTypes = ["contact","weapon","gear","artifact","spell","daemon","companion","vehicle","device"];
    if (standardTypes.includes(item.type)) return super._onDrop(event);
    if (item.type === "ability") {
      const existing = this.actor.items.find(i => i.type === "ability" && i.name === item.name);
      if (existing) { ui.notifications.warn(`Способность "${item.name}" уже есть на карточке.`); return; }
      const itemData = item.toObject();
      if (item.system.category === "common") {
        const fid = this.actor.system.faculty;
        if (fid) {
          const fi = game.packs.get("kk9.kk9-faculties")?.get(fid);
          if (fi && (fi.system.abilities || []).find(a => a.name === item.name))
            itemData.system.faculty_id = fid;
        }
      }
      await Item.create(itemData, { parent: this.actor });
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".rollable-attribute").click(e => this.actor.rollAttribute(e.currentTarget.dataset.attribute));
    html.find(".rollable-skill").click(e => this.actor.rollSkillItem(e.currentTarget.dataset.itemId));
    html.find(".rollable-ability").click(e => this.actor.rollAbility(e.currentTarget.dataset.itemId));
    html.find(".roll-initiative").click(() => this.actor.rollInitiative());
    html.find(".roll-toughness").click(() => this.actor.rollToughness());

    html.find(".health-pip[data-track='physical']").click(this._onPhysicalPipClick.bind(this));
    html.find(".health-pip[data-track='mental']").click(this._onMentalPipClick.bind(this));

    html.find(".item-name-click, .item-img").click(e => {
      const row = e.currentTarget.closest("[data-item-id]");
      if (!row) return;
      this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
    });

    html.find(".item-create").click(this._onItemCreate.bind(this));
    html.find(".item-delete").click(this._onItemDelete.bind(this));
    html.find(".btn-delete-skill").click(this._onItemDelete.bind(this));

    html.find(".skill-die-select").change(this._onSkillDieChange.bind(this));
    html.find(".skill-mod-input").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      await this.actor.items.get(itemId)?.update({ "system.modifier": parseInt(e.currentTarget.value) || 0 });
    });
    html.find(".ability-die-select").change(async e => {
      await this.actor.items.get(e.currentTarget.dataset.itemId)?.update({ "system.die": parseInt(e.currentTarget.value) });
    });
    html.find(".ability-mod-input").change(async e => {
      await this.actor.items.get(e.currentTarget.dataset.itemId)?.update({ "system.modifier": parseInt(e.currentTarget.value) || 0 });
    });
    html.find(".magic-level-select").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const level  = parseInt(e.currentTarget.value);
      const levels = foundry.utils.deepClone(this.actor.system.magicLevels || []);
      const idx    = levels.findIndex(l => l.itemId === itemId);
      if (idx >= 0) levels[idx].level = level; else levels.push({ itemId, level });
      await this.actor.update({ "system.magicLevels": levels });
    });

    html.find(".love-toggle").click(this._onLoveToggle.bind(this));
    html.find(".add-relation").click(this._onAddRelation.bind(this));
    html.find(".delete-relation").click(this._onDeleteRelation.bind(this));
    html.find(".relation-level-range").on("input", e => {
      const valEl = e.currentTarget.closest(".relation-row")?.querySelector(".relation-level-val");
      if (valEl) valEl.textContent = e.currentTarget.value;
    });
    html.find(".delete-language").click(this._onDeleteLanguage.bind(this));

    // Удалить активный статус
    html.find(".actor-remove-status").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const statuses = foundry.utils.deepClone(this.actor.system.active_statuses || []);
      statuses.splice(idx, 1);
      await this.actor.update({ "system.active_statuses": statuses });
    });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type     = event.currentTarget.dataset.type;
    const category = event.currentTarget.dataset.category;
    const names = {
      weapon:"Новое оружие", gear:"Новое снаряжение", artifact:"Новый артефакт",
      spell:"Новое заклинание", daemon:"Новый даймон", ability:"Новая способность",
      companion:"Новый спутник", vehicle:"Новый транспорт",
      device:"Новое устройство", contact:"Новый контакт", language:"Новый язык"
    };
    const itemData = { name: names[type] || `Новый ${type}`, type };
    if (category) itemData.system = { category };
    await Item.create(itemData, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const el     = event.currentTarget;
    const itemId = el.dataset.itemId || el.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const magicLevels = (this.actor.system.magicLevels || []).filter(ml => ml.itemId !== itemId);
    if (magicLevels.length !== (this.actor.system.magicLevels || []).length)
      await this.actor.update({ "system.magicLevels": magicLevels });
    await this.actor.items.get(itemId)?.delete();
  }

  async _onSkillDieChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const die    = parseInt(event.currentTarget.value);
    const item   = this.actor.items.get(itemId);
    if (!item) return;
    const linkedAttr = item.system.linkedAttribute;
    const attrDie    = this.actor.system.attributes?.[linkedAttr]?.die;
    if (attrDie && die > attrDie) {
      ui.notifications.warn(`Кубик навыка не может превышать кубик атрибута (d${attrDie})`);
      this.render(); return;
    }
    await item.update({ "system.die": die });
  }

  async _onPhysicalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.physical.value;
    await this.actor.update({ "system.health.physical.value": val === cur ? val - 1 : val });
  }

  async _onMentalPipClick(event) {
    const val = parseInt(event.currentTarget.dataset.value);
    const cur = this.actor.system.health.mental.value;
    await this.actor.update({ "system.health.mental.value": val === cur ? val - 1 : val });
  }

  async _onLoveToggle(event) {
    event.preventDefault();
    const idx       = parseInt(event.currentTarget.dataset.index);
    const relations = [...(this.actor.system.relations || [])];
    const wasLoved  = relations[idx]?.love;
    relations.forEach(r => r.love = false);
    if (!wasLoved && relations[idx]) relations[idx].love = true;
    await this.actor.update({ "system.relations": relations });
  }

  async _onAddRelation(event) {
    event.preventDefault();
    const relations = this.actor.system.relations || [];
    await this.actor.update({ "system.relations": [...relations, { name:"", status:"neutral", level:0, notes:"", love:false }] });
  }

  async _onDeleteRelation(event) {
    event.preventDefault();
    const idx       = parseInt(event.currentTarget.dataset.index);
    const relations = [...(this.actor.system.relations || [])];
    relations.splice(idx, 1);
    await this.actor.update({ "system.relations": relations });
  }

  async _onDeleteLanguage(event) {
    event.preventDefault();
    const idx  = parseInt(event.currentTarget.dataset.index);
    const list = [...(this.actor.system.languages || [])];
    list.splice(idx, 1);
    await this.actor.update({ "system.languages": list });
  }
}

// ============================================================
// НПС — метки типов снаряжения
// ============================================================
const NPC_ITEM_TYPE_LABELS = {
  weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание",
  daemon:"Даймон", companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
  contact:"Контакт", language:"Язык", status:"Статус"
};

// ============================================================
// НПС — базовый класс
// ============================================================
class KK9NpcBaseSheet extends ActorSheet {

  getData() {
    const c = super.getData();
    c.system = c.data.system;
    c.attributeLabels  = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    c.npcItemTypeLabel = (type) => NPC_ITEM_TYPE_LABELS[type] || type;
    c.npcAllItems = this.actor.items.filter(i => i.type === "skill" || i.type === "ability");
    c.npcGear     = this.actor.items.filter(i => !["skill","ability"].includes(i.type));
    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".item-name-click, .item-img").click(e => {
      const row = e.currentTarget.closest("[data-item-id]");
      if (!row) return;
      this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
    });

    html.find(".npc-item-del").click(async e => {
      e.preventDefault();
      const itemId = e.currentTarget.dataset.itemId
        || e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) await this.actor.items.get(itemId)?.delete();
    });

    html.find(".npc-skill-die").change(async e => {
      e.stopPropagation();
      const itemId = e.currentTarget.dataset.itemId;
      const die    = parseInt(e.currentTarget.value);
      if (itemId) await this.actor.items.get(itemId)?.update({ "system.die": die });
    });

    html.find(".npc-skill-mod").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const mod    = parseInt(e.currentTarget.value) || 0;
      if (itemId) await this.actor.items.get(itemId)?.update({ "system.modifier": mod });
    });

    html.find(".npc-rollable").click(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;
      const die    = item.system.die || 4;
      const mod    = item.system.modifier || 0;
      const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
      const roll   = new Roll(this._buildRollFormula(die, modStr));
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor:  `<strong>${this.actor.name}</strong> — ${item.name}`
      });
    });

    html.find(".health-pip[data-track='npc-physical']").click(async e => {
      const val = parseInt(e.currentTarget.dataset.value);
      const cur = this.actor.system.health?.physical?.value ?? 0;
      await this.actor.update({ "system.health.physical.value": cur === val ? val - 1 : val });
    });
    html.find(".health-pip[data-track='npc-mental']").click(async e => {
      const val = parseInt(e.currentTarget.dataset.value);
      const cur = this.actor.system.health?.mental?.value ?? 0;
      await this.actor.update({ "system.health.mental.value": cur === val ? val - 1 : val });
    });

    html.find(".btn-relation-delete, .delete-relation").click(async e => {
      const idx       = parseInt(e.currentTarget.dataset.index);
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      relations.splice(idx, 1);
      await this.actor.update({ "system.relations": relations });
    });
    html.find(".btn-add-relation, .add-relation").click(async () => {
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      relations.push({ name:"", status:"neutral", level:0, notes:"", love:false });
      await this.actor.update({ "system.relations": relations });
    });
    html.find(".relation-level-range").on("input", e => {
      const valEl = e.currentTarget.closest(".relation-row")?.querySelector(".relation-level-val");
      if (valEl) valEl.textContent = e.currentTarget.value;
    });

    // Удалить активный статус
    html.find(".actor-remove-status").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const statuses = foundry.utils.deepClone(this.actor.system.active_statuses || []);
      statuses.splice(idx, 1);
      await this.actor.update({ "system.active_statuses": statuses });
    });
  }

  _buildRollFormula(die, modStr) { return `1d${die}${modStr}`; }
}

// ============================================================
// ЛЁГКИЙ НПС
// ============================================================
export class KK9NpcLightSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-light"],
      template: "systems/kk9/templates/actors/npc-light-sheet.hbs",
      width: 780, height: 700,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }],
      dragDrop: [{ dragSelector:null, dropSelector:null }]
    });
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-npc-attr").click(async e => {
      const attr  = e.currentTarget.dataset.attribute;
      const die   = this.actor.system.attributes[attr]?.die;
      if (!die) return;
      const label = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" }[attr] || attr;
      const roll  = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — ${label}` });
    });
  }
}

// ============================================================
// СЛОЖНЫЙ НПС
// ============================================================
export class KK9NpcHardSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-hard"],
      template: "systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width: 780, height: 720,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }],
      dragDrop: [{ dragSelector:null, dropSelector:null }]
    });
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-npc-attr").click(async e => {
      const attr  = e.currentTarget.dataset.attribute;
      const die   = this.actor.system.attributes[attr]?.die;
      if (!die) return;
      const label = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" }[attr] || attr;
      const roll  = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — ${label}` });
    });
  }
}

// ============================================================
// НЕПОБЕДИМЫЙ НПС
// ============================================================
export class KK9NpcBossSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","actor","npc-boss"],
      template: "systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width: 780, height: 740,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"main" }],
      dragDrop: [{ dragSelector:null, dropSelector:null }]
    });
  }
  _buildRollFormula(die, modStr) { return `{1d6${modStr}, 1d${die}${modStr}}kh`; }
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".rollable-npc-attr-boss").click(async e => {
      const attr  = e.currentTarget.dataset.attribute;
      const die   = this.actor.system.attributes[attr]?.die;
      if (!die) return;
      const label = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" }[attr] || attr;
      const roll  = new Roll(`{1d6, 1d${die}}kh`);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — ${label} (д6 + д${die}, лучший)` });
    });
  }
}

// ============================================================
// ITEM ЛИСТ
// ============================================================
export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","item"],
      width: 680, height: 700,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"description" }],
      dragDrop: [{
        dragSelector: null,
        dropSelector: ".faculty-abilities-drop, .faculty-students-drop, .fac-dropouts-drop, .faculty-predecessor-drop, .fac-lore-drop, .weapon-skill-drop, .weapon-status-drop"
      }]
    });
  }

  get template() { return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`; }

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
      const abilities = context.system.abilities || [];
      context.facultyAbilities = abilities;
      context.abCount = {
        common:   abilities.filter(a => a.category === "common").length,
        personal: abilities.filter(a => a.category === "personal").length,
        learned:  abilities.filter(a => a.category === "learned").length,
        magic:    abilities.filter(a => a.category === "magic").length,
      };
    }
    return context;
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }

    // ── Оружие: drag-drop навыка или статуса ──
    if (this.item.type === "weapon") {
      const target = event.target.closest(".weapon-skill-drop, .weapon-status-drop");
      if (target) {
        if (data.type !== "Item") return;
        const item = await fromUuid(data.uuid);
        if (!item) return;
        if (target.classList.contains("weapon-skill-drop") && ["skill","ability"].includes(item.type)) {
          await this.item.update({ "system.skill_uuid": item.uuid, "system.skill_name": item.name });
          return;
        }
        if (target.classList.contains("weapon-status-drop") && item.type === "status") {
          await this.item.update({ "system.status_uuid": item.uuid, "system.status_name": item.name });
          return;
        }
        return;
      }
    }

    // ── Факультет ──
    if (this.item.type !== "faculty") return super._onDrop(event);

    const target = event.target.closest(
      ".faculty-abilities-drop, .faculty-students-drop, .fac-dropouts-drop, .faculty-predecessor-drop, .fac-lore-drop"
    );
    if (!target) return;

    if (target.classList.contains("faculty-abilities-drop")) {
      if (data.type !== "Item") return;
      const item = await fromUuid(data.uuid);
      if (!item || !["ability","skill"].includes(item.type)) return;
      const abilities = [...(this.item.system.abilities || [])];
      if (!abilities.find(a => a.itemId === item.id)) {
        abilities.push({ name: item.name, itemId: item.id, category: item.system.category || (item.type === "skill" ? "common" : "learned") });
        await this.item.update({ "system.abilities": abilities });
      }
      return;
    }

    if (target.classList.contains("faculty-students-drop")) {
      if (!data.uuid) return;
      const actor = await fromUuid(data.uuid);
      if (!actor || !(actor instanceof Actor)) return;
      const students = [...(this.item.system.students || [])];
      if (students.find(s => s.actorUuid === data.uuid)) return;
      const courseInput = await Dialog.prompt({
        title: `${actor.name} — курс и семестр`,
        content: `<div style="display:flex;gap:16px;align-items:center;padding:10px 0">
          <label>Курс: <select id="fac-course">${[1,2,3,4,5].map(i=>`<option value="${i}">${i}</option>`).join("")}</select></label>
          <label>Семестр: <select id="fac-sem"><option value="1">1</option><option value="2">2</option></select></label>
        </div>`,
        callback: html => ({ course: parseInt(html.find("#fac-course").val()), semester: parseInt(html.find("#fac-sem").val()) }),
        options: { width: 300 }
      }).catch(() => null);
      if (!courseInput) return;
      students.push({ actorUuid: data.uuid, studentName: actor.name, course: courseInput.course, semester: courseInput.semester, isStar: false });
      await this.item.update({ "system.students": students });
      return;
    }

    if (target.classList.contains("fac-dropouts-drop")) {
      if (!data.uuid) return;
      const actor = await fromUuid(data.uuid);
      if (!actor || !(actor instanceof Actor)) return;
      const dropouts = [...(this.item.system.dropouts || [])];
      if (dropouts.find(d => d.actorUuid === data.uuid)) return;
      dropouts.push({ actorUuid: data.uuid, studentName: actor.name, reason: "" });
      await this.item.update({ "system.dropouts": dropouts });
      return;
    }

    if (target.classList.contains("faculty-predecessor-drop")) {
      if (data.type !== "Item") return;
      const fi = await fromUuid(data.uuid);
      if (!fi || fi.type !== "faculty") return;
      if (fi.system.active) { ui.notifications.warn("Предшественником может быть только неактивный факультет."); return; }
      await this.item.update({ "system.predecessor_uuid": data.uuid, "system.predecessor_name": fi.name });
      return;
    }

    if (target.classList.contains("fac-lore-drop")) {
      if (data.type !== "JournalEntry") return;
      const journal = await fromUuid(data.uuid);
      if (!journal) return;
      const lore = [...(this.item.system.lore_entries || [])];
      if (lore.find(l => l.uuid === data.uuid)) return;
      lore.push({ uuid: data.uuid, name: journal.name });
      await this.item.update({ "system.lore_entries": lore });
      return;
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".roll-damage").click(() => this.item.rollDamage());

    // ── Оружие ──
    if (this.item.type === "weapon") {
      html.find(".weapon-attack-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Оружие должно быть на карточке персонажа."); return; }
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(this.item, this.item.actor);
      });
      html.find(".wp-clear-skill").click(async () => {
        await this.item.update({ "system.skill_uuid": "", "system.skill_name": "" });
      });
      html.find(".wp-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
    }

    // ── Факультет: убрать способность ──
    html.find(".remove-faculty-ability").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const abilities = [...(this.item.system.abilities || [])];
      abilities.splice(idx, 1);
      await this.item.update({ "system.abilities": abilities });
    });

    // ── Факультет: звёздочка ──
    html.find(".fac-star-btn").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      const students = (this.item.system.students || []).map(s =>
        s.actorUuid === uuid ? { ...s, isStar: !s.isStar } : s
      );
      await this.item.update({ "system.students": students });
    });

    // ── Факультет: удалить студента ──
    html.find(".fac-remove-student").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.students": (this.item.system.students || []).filter(s => s.actorUuid !== uuid) });
    });

    // ── Факультет: удалить из отсева ──
    html.find(".fac-remove-dropout").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.dropouts": (this.item.system.dropouts || []).filter(d => d.actorUuid !== uuid) });
    });

    // ── Факультет: убрать предшественника ──
    html.find(".faculty-clear-predecessor").click(async () => {
      await this.item.update({ "system.predecessor_uuid": "", "system.predecessor_name": "" });
    });

    // ── Факультет: удалить байку ──
    html.find(".fac-remove-lore").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.lore_entries": (this.item.system.lore_entries || []).filter(l => l.uuid !== uuid) });
    });

    // ── Факультет: открыть по клику ──
    html.find(".fac-open-actor, .fac-open-predecessor, .fac-open-journal").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      if (!uuid) return;
      const doc = await fromUuid(uuid);
      doc?.sheet?.render(true);
    });
  }
}
