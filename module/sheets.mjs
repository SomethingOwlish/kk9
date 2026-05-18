// ============================================================
// КК9 — Листы v1.1
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
    context.categoryLabel = (cat) => ({common:"Общая",personal:"Личная",learned:"Изучаемая",magic:"Магическая"})[cat] || cat;

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

    // Факультетские — по faculty_id на items (работает без загрузки пака)
    const facultyItems = facultyId ? [
      ...allAbilities.filter(i =>
        i.system.faculty_id === facultyId ||
        (i.system.category === "common" && facultyAbilityNames.has(i.name))
      ),
      ...allSkills.filter(i => facultyAbilityNames.has(i.name))
    ] : [];
    context.facultyAbilities = facultyItems;
    const facultyAbilityIds = new Set(facultyItems.map(i => i.id));

    // Магические — ВСЕ magic (включая факультетские)
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

    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      const relations = this.actor.system.relations || [];
      if (!relations.find(r => r.name === actor.name)) {
        await this.actor.update({ "system.relations": [...relations, { name:actor.name, status:"neutral", level:0, notes: actor.type==="character" ? "Игровой персонаж" : "", love:false }] });
      }
      return;
    }
    if (data.type !== "Item") return super._onDrop(event);
    const item = await fromUuid(data.uuid);
    if (!item) return;
    if (item.type === "faculty") { await this.actor._applyFaculty(item); return; }
    if (item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.name === item.name)) await this.actor.update({ "system.languages": [...langs, { name:item.name, itemId:item.id }] });
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
          if (fi && (fi.system.abilities || []).find(a => a.name === item.name)) itemData.system.faculty_id = fid;
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
  }

  async _onSkillDieChange(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const die = parseInt(event.currentTarget.value);
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const linkedAttr = item.system.linkedAttribute;
    const attrDie = this.actor.system.attributes?.[linkedAttr]?.die;
    if (attrDie && die > attrDie) { ui.notifications.warn(`Кубик навыка не может превышать кубик атрибута (d${attrDie})`); this.render(); return; }
    await item.update({ "system.die": die });
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
  async _onLoveToggle(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const relations = [...(this.actor.system.relations || [])];
    const wasLoved = relations[idx].love;
    relations.forEach(r => r.love = false);
    if (!wasLoved) relations[idx].love = true;
    await this.actor.update({ "system.relations": relations });
  }
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
  async _onDeleteLanguage(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    const list = [...(this.actor.system.languages || [])];
    list.splice(idx, 1);
    await this.actor.update({ "system.languages": list });
  }
  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
    const category = event.currentTarget.dataset.category;
    const names = { weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание", daemon:"Даймон", ability:"Способность", companion:"Спутник", vehicle:"Транспорт", device:"Устройство", contact:"Контакт", language:"Язык" };
    const itemData = { name:`Новая ${names[type]||type}`, type };
    if (category) itemData["system.category"] = category;
    await Item.create(itemData, { parent: this.actor });
  }
  async _onItemDelete(event) {
    event.preventDefault();
    const el = event.currentTarget;
    const itemId = el.dataset.itemId || el.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const magicLevels = (this.actor.system.magicLevels || []).filter(ml => ml.itemId !== itemId);
    if (magicLevels.length !== (this.actor.system.magicLevels || []).length) await this.actor.update({ "system.magicLevels": magicLevels });
    await this.actor.items.get(itemId)?.delete();
  }
}

// ============================================================
// НПС — метки типов для снаряжения
// ============================================================
const NPC_ITEM_TYPE_LABELS = {
  weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание",
  daemon:"Даймон", companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
  contact:"Контакт", language:"Язык"
};

// ============================================================
// НПС — базовый класс
// ============================================================
class KK9NpcBaseSheet extends ActorSheet {

  getData() {
    const c = super.getData();
    c.system = c.data.system;
    c.attributeLabels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    // Хелпер для типа снаряжения в шаблоне
    c.npcItemTypeLabel = (type) => NPC_ITEM_TYPE_LABELS[type] || type;
    // Навыки и способности вместе
    c.npcAllItems = this.actor.items.filter(i => i.type === "skill" || i.type === "ability");
    // Снаряжение — всё остальное
    c.npcGear = this.actor.items.filter(i => !["skill","ability"].includes(i.type));
    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Открыть предмет
    html.find(".item-name-click").click(e => {
      const row = e.currentTarget.closest("[data-item-id]");
      if (!row) return;
      this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
    });

    // Удалить предмет (навык или снаряжение)
    html.find(".npc-item-del").click(async e => {
      e.preventDefault();
      const itemId = e.currentTarget.dataset.itemId || e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (itemId) await this.actor.items.get(itemId)?.delete();
    });

    // Изменить кубик навыка/способности
    html.find(".npc-skill-die").change(async e => {
      e.stopPropagation();
      const itemId = e.currentTarget.dataset.itemId;
      const die = parseInt(e.currentTarget.value);
      if (itemId) await this.actor.items.get(itemId)?.update({ "system.die": die });
    });

    // Изменить модификатор навыка/способности
    html.find(".npc-skill-mod").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const mod = parseInt(e.currentTarget.value) || 0;
      if (itemId) await this.actor.items.get(itemId)?.update({ "system.modifier": mod });
    });

    // Бросок навыка/способности
    html.find(".npc-rollable").click(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (!item) return;
      const die = item.system.die || 4;
      const mod = item.system.modifier || 0;
      const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
      const formula = this._buildRollFormula(die, modStr);
      const roll = new Roll(formula);
      await roll.evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — ${item.name}` });
    });

    // Пипы физического состояния
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
    html.find(".npc-ko-pip[data-track='npc-physical-ko']").click(async () => {
      await this.actor.update({ "system.health.physical.knockout": !this.actor.system.health.physical.knockout });
    });
    html.find(".npc-ko-pip[data-track='npc-mental-ko']").click(async () => {
      await this.actor.update({ "system.health.mental.knockout": !this.actor.system.health.mental.knockout });
    });

    // Связи — love
    html.find(".love-toggle").click(async e => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.dataset.index);
      const relations = [...(this.actor.system.relations || [])];
      const wasLoved = relations[idx].love;
      relations.forEach(r => r.love = false);
      if (!wasLoved) relations[idx].love = true;
      await this.actor.update({ "system.relations": relations });
    });
    // Связи — удалить
    html.find(".delete-relation").click(async e => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.dataset.index);
      const rel = [...(this.actor.system.relations || [])];
      rel.splice(idx, 1);
      await this.actor.update({ "system.relations": rel });
    });
    // Связи — добавить
    html.find(".add-relation").click(async e => {
      e.preventDefault();
      const relations = this.actor.system.relations || [];
      await this.actor.update({ "system.relations": [...relations, { name:"", status:"neutral", level:0, notes:"", love:false }] });
    });

    // Инициатива
    html.find(".roll-npc-initiative").click(() => this._rollInitiative());
    // Стойкость — модалка с выбором навыка
    html.find(".roll-npc-toughness").click(() => this._rollToughness());
  }

  // Переопределяется в боссе для дикого кубика
  _buildRollFormula(die, modStr) {
    return `1d${die}${modStr}`;
  }

  async _rollInitiative() {
    const ag = this.actor.system.attributes.agility?.die || 4;
    const sm = this.actor.system.attributes.smarts?.die  || 4;
    const roll = new Roll(`1d${ag} + 1d${sm}`);
    await roll.evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — Инициатива` });
  }

  async _rollToughness() {
    // Собираем навыки сопротивления из items актора
    const resistNames = ["Противостояние пыткам","Противостояние яду","Противостояние истощению","Выжидание"];
    const available = this.actor.items.filter(i =>
      (i.type === "skill" || i.type === "ability") && resistNames.includes(i.name)
    );
    const options = available.map(s =>
      `<option value="${s.id}|${s.system.die||4}">${s.name} (d${s.system.die||4})</option>`
    ).join("");

    const result = await Dialog.prompt({
      title: "Бросок Стойкости",
      content: `<div style="padding:8px">
        <p style="margin-bottom:8px">Дух${available.length ? " + навык сопротивления" : ""}</p>
        ${available.length
          ? `<select id="resist-skill" style="width:100%">
               <option value="">— только Дух —</option>
               ${options}
             </select>`
          : "<em>Нет доступных навыков сопротивления</em>"}
      </div>`,
      label: "Бросить",
      callback: html => html.find("#resist-skill").val() || null
    });

    const spiritDie = this.actor.system.attributes.spirit?.die || 4;
    let formula, flavorExtra = "";
    if (result) {
      const [itemId, skillDie] = result.split("|");
      const skillItem = this.actor.items.get(itemId);
      flavorExtra = skillItem ? ` + ${skillItem.name}` : "";
      formula = `1d${spiritDie} + 1d${skillDie}`;
    } else {
      formula = `1d${spiritDie}`;
    }
    const roll = new Roll(formula);
    await roll.evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — Стойкость${flavorExtra}` });
  }

  async _onDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return super._onDrop(event); }

    if (data.type === "Actor") {
      event.preventDefault();
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      const relations = this.actor.system.relations || [];
      if (!relations.find(r => r.name === actor.name)) {
        await this.actor.update({ "system.relations": [...relations, { name:actor.name, status:"neutral", level:0, notes:"", love:false }] });
      }
      return;
    }

    if (data.type === "Item") {
      event.preventDefault();
      const item = await Item.fromDropData(data);
      if (!item) return;
      // Без дублей для навыков и способностей
      if (item.type === "skill" || item.type === "ability") {
        const existing = this.actor.items.find(i => i.name === item.name && i.type === item.type);
        if (existing) { ui.notifications.warn(`"${item.name}" уже есть на карточке.`); return; }
      }
      await Item.create(item.toObject(), { parent: this.actor });
      return;
    }

    return super._onDrop(event);
  }
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
// НЕПОБЕДИМЫЙ НПС — дикий кубик
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

  // Дикий кубик для навыков
  _buildRollFormula(die, modStr) {
    return `{1d6${modStr}, 1d${die}${modStr}}kh`;
  }

  activateListeners(html) {
    super.activateListeners(html);
    // Бросок атрибута с диким кубиком
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

  // Инициатива босса с диким кубиком
  async _rollInitiative() {
    const ag = this.actor.system.attributes.agility?.die || 4;
    const sm = this.actor.system.attributes.smarts?.die  || 4;
    const roll = new Roll(`{1d6, 1d${ag} + 1d${sm}}kh`);
    await roll.evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<strong>${this.actor.name}</strong> — Инициатива (дикий кубик)` });
  }
}

// ============================================================
// ITEM ЛИСТ
// ============================================================
export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","item"],
      width: 560, height: 520,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"description" }],
      dragDrop: [{ dragSelector:null, dropSelector:".faculty-abilities-drop" }]
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
    if (this.item.type === "faculty") context.facultyAbilities = context.system.abilities || [];
    return context;
  }

  async _onDrop(event) {
    if (this.item.type !== "faculty") return super._onDrop(event);
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item || !["ability","skill"].includes(item.type)) return;
    const abilities = [...(this.item.system.abilities || [])];
    if (!abilities.find(a => a.itemId === item.id)) {
      abilities.push({ name:item.name, itemId:item.id, category:item.system.category || (item.type==="skill" ? "common" : "learned") });
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
