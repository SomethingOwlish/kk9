// ============================================================
// КК9 — НПС Листы v1.1 (ИСПРАВЛЕНО: drag & drop)
// ============================================================

// ============================================================
// Метки типов снаряжения
// ============================================================
const NPC_ITEM_TYPE_LABELS = {
  weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт", spell:"Заклинание",
  daemon:"Даймон", companion:"Спутник", vehicle:"Транспорт", device:"Устройство",
  contact:"Контакт", language:"Язык", status:"Статус"
};

// ============================================================
// Базовый класс для всех НПС
// ============================================================
class KK9NpcBaseSheet extends ActorSheet {

  getData() {
    const c = super.getData();
    c.system = c.data.system;
    c.attributeLabels  = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    c.relationLabels   = { ally:"Союзник", enemy:"Враг", neutral:"Нейтрал", unknown:"Неизвестно" };
    c.npcItemTypeLabel = (type) => NPC_ITEM_TYPE_LABELS[type] || type;

    // Навыки и способности вместе
    c.npcAllItems = this.actor.items.filter(i => i.type === "skill" || i.type === "ability");

    // Всё остальное имущество
    c.npcGear = this.actor.items.filter(i => !["skill", "ability"].includes(i.type));

    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Открыть предмет по клику на имя
    html.find(".item-name-click").click(e => {
      const id = e.currentTarget.dataset.itemId;
      this.actor.items.get(id)?.sheet.render(true);
    });

    // Удалить предмет
    html.find(".btn-item-delete").click(async e => {
      const id = e.currentTarget.dataset.itemId;
      await this.actor.items.get(id)?.delete();
    });

    // Связи — удалить
    html.find(".btn-relation-delete, .delete-relation").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      relations.splice(idx, 1);
      await this.actor.update({ "system.relations": relations });
    });

    // Связи — добавить
    html.find(".btn-add-relation, .add-relation").click(async () => {
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      relations.push({ name: "Новый персонаж", status: "neutral", level: 0, notes: "", love: false });
      await this.actor.update({ "system.relations": relations });
    });

    // Слайдер уровня связи — живое обновление
    html.find(".relation-level-range").on("input", e => {
      const valEl = e.currentTarget.closest(".relation-row")?.querySelector(".relation-level-val");
      if (valEl) valEl.textContent = e.currentTarget.value;
    });

    // Пипы физического здоровья
    html.find(".health-pip[data-track='npc-physical']").click(async e => {
      const val = parseInt(e.currentTarget.dataset.value);
      const cur = this.actor.system.health?.physical?.value ?? 0;
      await this.actor.update({
        "system.health.physical.value": cur === val ? val - 1 : val
      });
    });

    // Пипы ментального здоровья
    html.find(".health-pip[data-track='npc-mental']").click(async e => {
      const val = parseInt(e.currentTarget.dataset.value);
      const cur = this.actor.system.health?.mental?.value ?? 0;
      await this.actor.update({
        "system.health.mental.value": cur === val ? val - 1 : val
      });
    });

    // KO-ячейки физического
    html.find(".npc-ko-pip[data-track='npc-physical-ko']").click(async () => {
      const cur = this.actor.system.health?.physical?.knockout;
      await this.actor.update({ "system.health.physical.knockout": !cur });
    });

    // KO-ячейки ментального
    html.find(".npc-ko-pip[data-track='npc-mental-ko']").click(async () => {
      const cur = this.actor.system.health?.mental?.knockout;
      await this.actor.update({ "system.health.mental.knockout": !cur });
    });

    // Удалить активный статус
    html.find(".actor-remove-status").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const statuses = foundry.utils.deepClone(this.actor.system.active_statuses || []);
      statuses.splice(idx, 1);
      await this.actor.update({ "system.active_statuses": statuses });
    });
  }

  // ── Правильный drop через Foundry DragDrop API ──
  // Вызывается автоматически когда dropSelector срабатывает
  async _onDrop(event) {
    event.preventDefault();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch(e) {
      return super._onDrop(event);
    }

    if (!data || data.type !== "Item") return super._onDrop(event);

    const item = await Item.fromDropData(data);
    if (!item) return;

    // Не дублируем предмет если уже есть на акторе
    const existing = this.actor.items.find(i => i.name === item.name && i.type === item.type);
    if (existing) {
      ui.notifications.warn(`«${item.name}» уже есть на карточке.`);
      return;
    }

    await Item.create(item.toObject(), { parent: this.actor });
  }

  // Стандартный Foundry hook для drop из компендиумов/директории
  async _onDropItem(event, data) {
    const item = await Item.fromDropData(data);
    if (!item) return;

    const existing = this.actor.items.find(i => i.name === item.name && i.type === item.type);
    if (existing) {
      ui.notifications.warn(`«${item.name}» уже есть на карточке.`);
      return;
    }

    await Item.create(item.toObject(), { parent: this.actor });
  }

  _buildRollFormula(die, modStr) { return `1d${die}${modStr}`; }
}

// ============================================================
// ЛЁГКИЙ НПС
// ============================================================
export class KK9NpcLightSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-light"],
      template: "systems/kk9/templates/actors/npc-light-sheet.hbs",
      width: 720, height: 640,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
      // FIX: dropSelector задан — Foundry теперь перехватывает drop события
      dragDrop: [{ dragSelector: null, dropSelector: ".npc-drop-zone" }]
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Бросок одного кубика (без д6)
    html.find(".rollable-npc-die").click(async () => {
      const die = this.actor.system.die;
      const roll = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `<strong>${this.actor.name}</strong> — бросок`
      });
    });
  }
}

// ============================================================
// СЛОЖНЫЙ НПС
// ============================================================
export class KK9NpcHardSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-hard"],
      template: "systems/kk9/templates/actors/npc-hard-sheet.hbs",
      width: 760, height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
      // FIX: dropSelector задан
      dragDrop: [{ dragSelector: null, dropSelector: ".npc-drop-zone" }]
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Бросок атрибута (только свой кубик, без д6)
    html.find(".rollable-npc-attr, .rollable-attribute").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      const die = this.actor.system.attributes[attr]?.die;
      if (!die) return;
      const label = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух",
                      strength:"Сила", magic:"Магия" }[attr] || attr;
      const roll = new Roll(`1d${die}`);
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `<strong>${this.actor.name}</strong> — ${label}`
      });
    });
  }
}

// ============================================================
// НЕПОБЕДИМЫЙ НПС (БОСС)
// Бросает д6 + свой атрибут (как игрок)
// ============================================================
export class KK9NpcBossSheet extends KK9NpcBaseSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "npc-boss"],
      template: "systems/kk9/templates/actors/npc-boss-sheet.hbs",
      width: 760, height: 700,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }],
      // FIX: dropSelector задан
      dragDrop: [{ dragSelector: null, dropSelector: ".npc-drop-zone" }]
    });
  }

  _buildRollFormula(die, modStr) { return `{1d6${modStr}, 1d${die}${modStr}}kh`; }

  activateListeners(html) {
    super.activateListeners(html);

    // Бросок атрибута: д6 + свой кубик (как игрок)
    html.find(".rollable-attribute-boss, .rollable-npc-attr-boss").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      const die = this.actor.system.attributes[attr]?.die;
      if (!die) return;
      const label = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух",
                      strength:"Сила", magic:"Магия" }[attr] || attr;
      const roll = new Roll(`1d6 + 1d${die}`);
      await roll.evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `<strong>${this.actor.name}</strong> — ${label} (д6 + д${die})`
      });
    });
  }
}
