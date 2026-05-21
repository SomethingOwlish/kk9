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

    // love-toggle — избранная связь (все НПС)
    html.find(".love-toggle").click(async e => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.dataset.index);
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      const wasLoved = relations[idx]?.love;
      relations.forEach(r => r.love = false);
      if (!wasLoved && relations[idx]) relations[idx].love = true;
      await this.actor.update({ "system.relations": relations });
    });

    // love-toggle — избранная связь (все НПС)
    html.find(".love-toggle").click(async e => {
      e.preventDefault();
      const idx = parseInt(e.currentTarget.dataset.index);
      const relations = foundry.utils.deepClone(this.actor.system.relations || []);
      const wasLoved = relations[idx]?.love;
      relations.forEach(r => r.love = false);
      if (!wasLoved && relations[idx]) relations[idx].love = true;
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

    // Инициатива НПС — интеграция с combat tracker (все НПС)
    html.find(".roll-npc-initiative").click(async e => {
      e.preventDefault();
      const attrs = this.actor.system.attributes;
      const isWC  = this.actor.type === "npc-boss";
      const agDie = attrs?.agility?.die  || 6;
      const smDie = attrs?.smarts?.die   || 6;
      const agMod = attrs?.agility?.modifier  || 0;
      const smMod = attrs?.smarts?.modifier   || 0;
      const totalMod = agMod + smMod;
      const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
      let formula;
      if (isWC) {
        formula = `{1d${agDie}x, 1d6x}kh${modStr !== "" ? modStr : "+0"}`.replace(/\+0$/, "")
                + ` + {1d${smDie}x, 1d6x}kh`;
        formula = `{1d${agDie}x, 1d6x}kh + {1d${smDie}x, 1d6x}kh${modStr}`;
      } else {
        formula = `1d${agDie}x + 1d${smDie}x${modStr}`;
      }
      // Пробуем поместить в combat tracker
      const combat = game.combat;
      if (combat) {
        const combatant = combat.combatants.find(c => c.actorId === this.actor.id);
        if (combatant) {
          await combat.rollInitiative(combatant.id, { formula });
          return;
        }
      }
      // Иначе просто бросаем в чат
      const roll = new Roll(formula);
      await roll.evaluate();
      const total = roll.total;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — Инициатива<br>
          <span class="kk9-die-total">= ${total}</span></div>`,
        flags: { kk9: { isRoll: true } }
      });
    });

    // Стойкость НПС (2 + Дух/2)
    html.find(".roll-npc-toughness").click(async e => {
      e.preventDefault();
      const spiritDie = this.actor.system.attributes?.spirit?.die || 6;
      const isWC  = this.actor.type === "npc-boss";
      const formula = isWC
        ? `{1d${spiritDie}x, 1d6x}kh`
        : `1d${spiritDie}x`;
      const roll = new Roll(formula);
      await roll.evaluate();
      const toughness = this.actor.system.toughness ?? (2 + Math.floor(spiritDie / 2));
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — Стойкость (база ${toughness})<br>
          <span class="kk9-die-total">= ${roll.total}</span></div>`,
        flags: { kk9: { isRoll: true } }
      });
    });

    // Инициатива НПС — с интеграцией в combat tracker
    html.find(".roll-npc-initiative").click(async e => {
      e.preventDefault();
      const attrs = this.actor.system.attributes || {};
      const isWC  = this.actor.type === "npc-boss";
      const agDie = attrs.agility?.die  || 6;
      const smDie = attrs.smarts?.die   || 6;
      const agMod = attrs.agility?.modifier || 0;
      const smMod = attrs.smarts?.modifier  || 0;
      const totalMod = agMod + smMod;
      const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
      const formula = isWC
        ? `{1d${agDie}x, 1d6x}kh + {1d${smDie}x, 1d6x}kh${modStr}`
        : `1d${agDie}x + 1d${smDie}x${modStr}`;
      const roll = new Roll(formula);
      await roll.evaluate();
      // Пробуем записать в combat tracker
      const combat = game?.combat;
      if (combat) {
        const combatant = combat.combatants.find(c => c.actorId === this.actor.id);
        if (combatant) await combatant.update({ initiative: roll.total });
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — Инициатива<br>
          <span class="kk9-die-total">= ${roll.total}</span></div>`,
        flags: { kk9: { isRoll: true } }
      });
    });

    // Стойкость НПС (бросок Духа)
    html.find(".roll-npc-toughness").click(async e => {
      e.preventDefault();
      const spiritDie = this.actor.system.attributes?.spirit?.die || 6;
      const isWC  = this.actor.type === "npc-boss";
      const formula = isWC ? `{1d${spiritDie}x, 1d6x}kh` : `1d${spiritDie}x`;
      const roll = new Roll(formula);
      await roll.evaluate();
      const toughness = this.actor.system.toughness ?? (2 + Math.floor(spiritDie / 2));
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — Стойкость (база ${toughness})<br>
          <span class="kk9-die-total">= ${roll.total}</span></div>`,
        flags: { kk9: { isRoll: true } }
      });
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

    // Бросок одного кубика (без д6) — legacy
    html.find(".rollable-npc-die").click(async () => {
      const die = this.actor.system.die ?? 6;
      const roll = new Roll(`1d${die}x`);
      await roll.evaluate();
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — бросок<br>
          <span class="kk9-die-total">= ${roll.total}</span></div>`,
        flags: { kk9: { isRoll: true } }
      });
    });

    // Бросок атрибута лёгкого НПС (один кубик без д6)
    html.find(".rollable-npc-attr").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      const attrData = this.actor.system.attributes?.[attr];
      if (!attrData) {
        ui.notifications.warn(`${this.actor.name}: атрибут «${attr}» не найден.`);
        return;
      }
      const die = attrData.die || 6;
      const mod = attrData.modifier || 0;
      const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
      const ATTR_LABELS = { agility:"Ловкость", smarts:"Смекалка",
                            spirit:"Дух", strength:"Сила", magic:"Магия" };
      const label = ATTR_LABELS[attr] || attr;
      const roll = new Roll(`1d${die}x${modStr}`);
      await roll.evaluate();
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="kk9-roll-msg"><strong>${this.actor.name}</strong> — ${label}<br>
          <span class="kk9-die-total">= ${roll.total}</span></div>`,
        flags: { kk9: { isRoll: true } }
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
