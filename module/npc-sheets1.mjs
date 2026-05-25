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
    c.attributeLabels  = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
    c.relationLabels   = { ally:"Союзник", enemy:"Враг", neutral:"Нейтрал", unknown:"Неизвестно" };
    c.npcItemTypeLabel = (type) => NPC_ITEM_TYPE_LABELS[type] || type;

    // Навыки и способности — embedded
    c.npcAllItems = this.actor.items.filter(i => i.type === "ability");

    // Embedded снаряжение — только нужные типы
    // artifact/daemon/companion/contact — ref-типы, хранятся как UUID, не embedded
    const NPC_GEAR_TYPES = new Set(["weapon","gear","spell","vehicle","device"]);
    c.npcGear = this.actor.items.filter(i => NPC_GEAR_TYPES.has(i.type));

    // Ссылочные типы — одна общая коллекция npcRefs с uuid и refType
    const REF_MAP = { artifact_refs:"artifact", daemon_refs:"daemon", companion_refs:"companion", contact_refs:"contact" };
    c.npcRefs = [];
    for (const [field, refType] of Object.entries(REF_MAP)) {
      for (const uuid of (this.actor.system[field] || [])) {
        const doc = fromUuidSync(uuid);
        if (doc) c.npcRefs.push({ uuid, refType, name: doc.name, type: doc.type, img: doc.img, system: doc.system });
      }
    }

    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Открыть предмет по клику — embedded (data-item-id) или linked (data-uuid)
    html.find(".item-name-click").click(async e => {
      const row = e.currentTarget.closest("[data-item-id], [data-uuid]");
      if (!row) return;
      if (row.dataset.uuid) {
        const doc = await fromUuid(row.dataset.uuid);
        doc?.sheet?.render(true);
      } else {
        this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
      }
    });

    // ── Артефакт НПС: переключение иконок ──
    html.find(".artifact-toggle-btn").click(async e => {
      e.stopPropagation();
      const uuid   = e.currentTarget.dataset.uuid;
      const toggle = e.currentTarget.dataset.toggle;
      const doc    = await fromUuid(uuid);
      if (!doc) return;
      if (toggle === "active") {
        await doc.update({ "system.active": !doc.system.active });
      } else if (toggle === "equipped") {
        const cycle = { home: "carried", carried: "equipped", equipped: "home" };
        await doc.update({ "system.equipped": cycle[doc.system.equipped] || "home" });
      }
      this.render();
    });

    // ── Артефакт НПС: кнопка применения ──
    html.find(".artifact-use-btn").click(async e => {
      e.stopPropagation();
      const uuid   = e.currentTarget.dataset.uuid;
      const action = e.currentTarget.dataset.action;
      const doc    = await fromUuid(uuid);
      if (!doc) return;
      if (action === "attack") {
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(doc, this.actor);
      } else if (action === "energy") {
        const base    = doc.system.energy_restore || 0;
        const cond    = doc.system.condition;
        if (cond === "broken") { ui.notifications.warn("Артефакт сломан."); return; }
        const mult    = cond === "perfect" ? 1.5 : cond === "worn" ? 0.5 : 1;
        const restore = Math.floor(base * mult);
        const cur     = this.actor.system.energy?.value ?? 0;
        const max     = this.actor.system.energy?.max   ?? 0;
        const newVal  = Math.min(cur + restore, max);
        await this.actor.update({ "system.energy.value": newVal });
        ui.notifications.info(`${doc.name}: восстановлено ${newVal - cur} ед. энергии.`);
      }
    });

    // Удалить предмет — embedded или отвязать ref
    const _onItemDel = async e => {
      const REF_FIELD = { artifact:"artifact_refs", daemon:"daemon_refs", companion:"companion_refs", contact:"contact_refs" };
      const uuid    = e.currentTarget.dataset.uuid || e.currentTarget.closest("[data-uuid]")?.dataset.uuid;
      const refType = e.currentTarget.dataset.refType || e.currentTarget.closest("[data-ref-type]")?.dataset.refType;
      if (uuid && refType && REF_FIELD[refType]) {
        const field = REF_FIELD[refType];
        const refs  = (this.actor.system[field] || []).filter(r => r !== uuid);
        await this.actor.update({ [`system.${field}`]: refs });
        return;
      }
      const id = e.currentTarget.dataset.itemId || e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (id) await this.actor.items.get(id)?.delete();
    };
    // ── Weapon/Gear/Device/Spell: кнопка атаки из строки снаряжения (НПС) ──
    html.find(".item-attack-btn").click(async e => {
      e.stopPropagation();
      const itemId   = e.currentTarget.dataset.itemId;
      const itemType = e.currentTarget.dataset.itemType;
      const item     = this.actor.items.get(itemId);
      if (!item) return;

      // Проверяем экипировку (кроме спелла)
      if (itemType !== "spell" && item.system.equipped !== "equipped") {
        ui.notifications.warn(`${item.name}: не экипировано.`);
        return;
      }

      // Списываем quantity/charges
      if (itemType === "gear") {
        const qty = item.system.quantity ?? 0;
        if (qty <= 0) { ui.notifications.warn(`${item.name}: закончилось.`); return; }
        await item.update({ "system.quantity": qty - 1 });
      } else if (itemType === "device") {
        const charges = item.system.charges ?? -1;
        if (charges === 0) { ui.notifications.warn(`${item.name}: заряды закончились.`); return; }
        if (charges > 0) await item.update({ "system.charges": charges - 1 });
      }

      if (itemType === "spell") {
        const { rollSpellAttack } = await import("./weapon-combat.mjs");
        await rollSpellAttack(item, this.actor);
      } else {
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(item, this.actor);
      }
    });

    // ── Weapon/Gear/Device: переключатель экипировки из строки (НПС) ──
    html.find(".item-equip-btn").click(async e => {
      e.stopPropagation();
      const itemId = e.currentTarget.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;
      const cycle = { home: "carried", carried: "equipped", equipped: "home" };
      const cur   = item.system.equipped || "home";
      await item.update({ "system.equipped": cycle[cur] || "home" });
      this.render();
    });

    html.find(".btn-item-delete, .npc-item-del").click(_onItemDel);

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

    // KO-пипы — только для Hard/Boss (у лёгкого пипы 1,3,5 без отдельного KO)
    html.find(".npc-ko-pip[data-track='npc-physical-ko']").click(async () => {
      const cur = this.actor.system.health?.physical?.knockout;
      await this.actor.update({ "system.health.physical.knockout": !cur });
    });
    html.find(".npc-ko-pip[data-track='npc-mental-ko']").click(async () => {
      const cur = this.actor.system.health?.mental?.knockout;
      await this.actor.update({ "system.health.mental.knockout": !cur });
    });

    // Инициатива НПС — числовое значение + combat tracker
    html.find(".roll-npc-initiative").click(async e => {
      e.preventDefault();
      await this.actor.rollNpcInitiative(this.actor.type === "npc-boss");
    });

    // Стойкость НПС — успехи как у персонажа
    html.find(".roll-npc-toughness").click(async e => {
      e.preventDefault();
      await this.actor.rollNpcToughness(this.actor.type === "npc-boss");
    });

    // Бросок способности/навыка НПС
    html.find(".npc-rollable").click(async e => {
      const id = e.currentTarget.dataset.itemId;
      if (id) await this.actor.rollNpcSkill(id);
    });

    // Сохранение кубика способности НПС
    html.find(".npc-skill-die").change(async e => {
      const id  = e.currentTarget.dataset.itemId;
      const die = parseInt(e.currentTarget.value);
      if (id) await this.actor.items.get(id)?.update({ "system.die": die });
    });

    // Сохранение модификатора способности НПС
    html.find(".npc-skill-mod").change(async e => {
      const id  = e.currentTarget.dataset.itemId;
      const mod = parseInt(e.currentTarget.value) || 0;
      if (id) await this.actor.items.get(id)?.update({ "system.modifier": mod });
    });

    // Удалить активный статус
    html.find(".actor-remove-status").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index);
      const statuses = foundry.utils.deepClone(this.actor.system.active_statuses || []);
      statuses.splice(idx, 1);
      await this.actor.update({ "system.active_statuses": statuses });
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    // Foundry v13: используем TextDropData через super для получения data
    const data = await TextEditor.getDragEventData(event);
    if (!data) return super._onDrop(event);

    // ── Актор → связь ──
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      const relations = this.actor.system.relations || [];
      if (!relations.find(r => r.name === actor.name)) {
        await this.actor.update({ "system.relations": [...relations, {
          name: actor.name, status: "neutral", level: 0, notes: "", love: false
        }] });
      }
      return;
    }

    if (data.type !== "Item") return;
    const item = await fromUuid(data.uuid);
    if (!item) return;

    // ── Статус → active_statuses ──
    if (item.type === "status") {
      const { applyStatusToActor } = await import("./weapon-combat.mjs");
      await applyStatusToActor(this.actor, item);
      return;
    }

    // ── Faculty и language — игнорируем ──
    if (item.type === "faculty" || item.type === "language") return;

    // ── Ability → embedded ──
    if (item.type === "ability") {
      const existing = this.actor.items.find(i => i.name === item.name && i.type === "ability");
      if (existing) { ui.notifications.warn(`«${item.name}» уже есть на карточке.`); return; }
      await Item.create(item.toObject(), { parent: this.actor });
      return;
    }

    // ── Ref-типы → UUID в system.*_refs ──
    const REF_FIELD = { artifact:"artifact_refs", daemon:"daemon_refs", companion:"companion_refs", contact:"contact_refs" };
    if (REF_FIELD[item.type]) {
      const field = REF_FIELD[item.type];
      const uuid  = item.uuid;
      const refs  = [...(this.actor.system[field] || [])];
        if (refs.includes(uuid)) { ui.notifications.warn(`«${item.name}» уже привязан.`); return; }
      refs.push(uuid);
      await this.actor.update({ [`system.${field}`]: refs });
      return;
    }

    // ── Embedded снаряжение ──
    const GEAR_TYPES = new Set(["weapon","gear","spell","vehicle","device"]);
    if (GEAR_TYPES.has(item.type)) {
      const existing = this.actor.items.find(i => i.name === item.name && i.type === item.type);
      if (existing) { ui.notifications.warn(`«${item.name}» уже есть на карточке.`); return; }
      await Item.create(item.toObject(), { parent: this.actor });
      return;
    }
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
      dragDrop: [{ dragSelector: null, dropSelector: "form" }]
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

    // Бросок атрибута лёгкого НПС (без wild die, с успехами)
    html.find(".rollable-npc-attr").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      await this.actor.rollNpcAttribute(attr);
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
      dragDrop: [{ dragSelector: null, dropSelector: "form" }]
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Бросок атрибута сложного НПС (без wild die, с успехами)
    html.find(".rollable-npc-attr, .rollable-attribute").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      await this.actor.rollNpcAttribute(attr);
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
      dragDrop: [{ dragSelector: null, dropSelector: "form" }]
    });
  }

  _buildRollFormula(die, modStr) { return `{1d6${modStr}, 1d${die}${modStr}}kh`; }

  activateListeners(html) {
    super.activateListeners(html);

    // Бросок атрибута босса (wild die d6 + свой кубик, с успехами)
    html.find(".rollable-attribute-boss, .rollable-npc-attr-boss").click(async e => {
      const attr = e.currentTarget.dataset.attribute;
      await this.actor.rollNpcAttribute(attr);
    });
  }
}
