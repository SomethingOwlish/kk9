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
    c.isGM      = game.user.isGM;
    c.isOwner   = this.actor.isOwner;
    c.canConflict = game.user.isGM || this.actor.isOwner;
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

    // KK9 связь — цвет факультета для акцентов
    c.kk9Linked = c.system.kk9_linked || false;
    c.operativeClass = c.system.operative_class || "";
    c.facultyColor = c.system.operative_faculty_color || "";

    // Статусы — embedded Items на акторе
    c.activeStatuses = this.actor.items
      .filter(i => i.type === "status")
      .map(i => ({
        id:             i.id,
        name:           i.name,
        status_types:   i.system.status_types ?? [],
        apply_stun:     i.system.apply_stun ?? false,
        duration_mode:  i.system.duration?.mode  ?? "time",
        duration_value: i.system.duration?.value ?? 1,
      }));

    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Инжект --faculty-accent из operative_faculty_color
    const facultyColor = this.actor.system?.operative_faculty_color;
    if (facultyColor) {
      const form = (html[0]?.tagName === "FORM" ? html[0] : null)
                ?? html.find("form.kk9-sheet")[0]
                ?? html[0];
      if (form) {
        form.style.setProperty("--faculty-accent", facultyColor);
        form.style.setProperty("--faculty-accent-dim", facultyColor + "99");
        html.find(".relation-level-range").each(function() {
          this.style.accentColor = facultyColor;
        });
      }
    }

    // Удалить язык
    html.find(".btn-delete-language").click(async e => {
      const idx  = parseInt(e.currentTarget.dataset.index);
      const list = [...(this.actor.system.languages || [])];
      list.splice(idx, 1);
      await this.actor.update({ "system.languages": list });
    });

    // Очистить класс оперативника
    html.find(".clear-operative-faculty").click(async () => {
      await this.actor.update({
        "system.operative_class":         "",
        "system.operative_faculty_color": ""
      });
    });

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
      if (!game.user.isGM) return;
      const itemId = e.currentTarget.dataset.itemId;
      if (!itemId) { console.warn("KK9: actor-remove-status — нет itemId"); return; }
      try {
        const { removeStatusFromActor } = await import("./weapon-combat.mjs");
        await removeStatusFromActor(this.actor, itemId);
      } catch(err) {
        console.warn("KK9: removeStatusFromActor недоступен, fallback", err);
        const item = this.actor.items.get(itemId);
        if (item) await item.delete();
        const cache = foundry.utils.deepClone(this.actor.system.active_statuses || []);
        const idx   = cache.findIndex(s => s.itemId === itemId);
        if (idx >= 0) { cache.splice(idx, 1); await this.actor.update({ "system.active_statuses": cache }); }
      }
    });

    // Применить эффект статуса вручную (debt / debt_fate — только ГМ)
    html.find(".actor-apply-status").click(async e => {
      if (!game.user.isGM) return;
      const itemId     = e.currentTarget.dataset.itemId;
      const statusItem = this.actor.items.get(itemId);
      if (!statusItem) return;
      const { _applyStatusEffectsManual } = await import("./weapon-combat.mjs");
      if (_applyStatusEffectsManual) await _applyStatusEffectsManual(this.actor, statusItem);
    });
  }

  // Блокируем изменение энергии через форму для не-ГМ + cap на max
  _getSubmitData(updateData = {}) {
    const data = super._getSubmitData(updateData);
    if (!game.user.isGM) {
      delete data["system.energy.value"];
    } else if ("system.energy.value" in data) {
      const max = this.actor.system.energy?.max ?? 0;
      data["system.energy.value"] = Math.min(Math.max(0, data["system.energy.value"]), max);
    }
    return data;
  }

  async _onDrop(event) {
    event.preventDefault();
    // Foundry v13: используем TextDropData через super для получения data
    const data = await TextEditor.getDragEventData(event);
    if (!data) return super._onDrop(event);

    // ── Актор → связь или refs ──
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor || actor.id === this.actor.id) return;
      // Даймон/спутник — в refs если поле есть у этого типа актора
      if (actor.type === "daemon" || actor.type === "companion") {
        const fieldMap = { daemon:"daemon_refs", companion:"companion_refs" };
        const field = fieldMap[actor.type];
        if (this.actor.system[field] !== undefined) {
          const refs = [...(this.actor.system[field] || [])];
          if (refs.includes(actor.uuid)) { ui.notifications.warn(`«${actor.name}» уже привязан.`); return; }
          refs.push(actor.uuid);
          await this.actor.update({ [`system.${field}`]: refs });
          return;
        }
      }
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

    // ── Faculty → operative_class (если kk9_linked) ──
    if (item.type === "faculty") {
      if (!this.actor.system.kk9_linked) return;
      await this.actor.update({
        "system.operative_class":         item.name,
        "system.operative_faculty_color": item.system.color || ""
      });
      this.render();
      return;
    }

    // ── Language → system.languages ──
    if (item.type === "language") {
      const langs = [...(this.actor.system.languages || [])];
      if (langs.find(l => l.name === item.name)) {
        ui.notifications.warn(`«${item.name}» уже есть в списке языков.`); return;
      }
      langs.push({ name: item.name, itemId: item.id });
      await this.actor.update({ "system.languages": langs });
      return;
    }

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


// ============================================================
// КОНТЕЙНЕР
// ============================================================

const CONTAINER_TYPE_LABELS = {
  weapon:"Оружие", gear:"Снаряжение", artifact:"Артефакт",
  spell:"Заклинание", device:"Устройство", daemon:"Даймон", companion:"Спутник"
};

// Типы хранимые как UUID-ссылки (уникальные объекты)
const REF_TYPES = new Set(["artifact","daemon","companion"]);
// Типы хранимые как embedded copies
const EMBED_TYPES = new Set(["weapon","gear","spell","device"]);

export class KK9ContainerSheet extends ActorSheet {

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9", "sheet", "actor", "container"],
      template: "systems/kk9/templates/actors/container-sheet.hbs",
      width: 540, height: 640,
      dragDrop: [{ dragSelector: null, dropSelector: ".container-drop-zone" }]
    });
  }

  getData() {
    const c = super.getData();
    c.system       = c.data.system;
    c.isGM         = game.user.isGM;
    c.isOwner      = this.actor.isOwner;
    c.canTakeItems = c.isOwner || this.actor.testUserPermission(game.user, "LIMITED");
    c.canTakeMoney = c.canTakeItems && (c.system.money > 0);

    // Embedded items (weapon, gear, spell, device)
    const embedItems = this.actor.items.map(i => ({
      id: i.id, name: i.name, img: i.img, type: i.type,
      system: i.system, flags: i.flags, isRef: false
    }));

    // UUID-ссылки (artifact, daemon, companion)
    const REF_MAP = {
      artifact_refs: "artifact",
      daemon_refs:   "daemon",
      companion_refs:"companion"
    };
    const refItems = [];
    for (const [field, type] of Object.entries(REF_MAP)) {
      for (const uuid of (c.system[field] || [])) {
        const doc = fromUuidSync(uuid);
        if (doc) refItems.push({
          uuid, name: doc.name, img: doc.img, type,
          system: doc.system, flags: doc.flags ?? {}, isRef: true,
          refField: field
        });
      }
    }

    c.items = [...embedItems, ...refItems];

    // Счётчик по типам
    const counts = {};
    for (const item of c.items) {
      const label = CONTAINER_TYPE_LABELS[item.type] || item.type;
      counts[label] = (counts[label] || 0) + 1;
    }
    c.itemCounts = Object.entries(counts).map(([label, count]) => ({ label, count }));

    // Инициатива — даймоны (не шарики) и спутники с атрибутами
    const initItems = refItems.filter(i =>
      (i.type === "daemon" || i.type === "companion") &&
      i.system?.attributes &&
      !(i.type === "daemon" && i.system.is_orb === true)
    );
    c.initiativeItems         = initItems;
    c.hasInitiativeItems      = initItems.length > 0;
    c.multipleInitiativeItems = initItems.length > 1;

    return c;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Открыть карточку
    html.find(".item-name-click").click(async e => {
      e.stopPropagation();
      const id   = e.currentTarget.dataset.itemId;
      const uuid = e.currentTarget.dataset.uuid;
      if (uuid) {
        const doc = await fromUuid(uuid);
        doc?.sheet?.render(true);
      } else {
        this.actor.items.get(id)?.sheet.render(true);
      }
    });

    // ГМ-только
    if (game.user.isGM) {
      // Удалить embedded
      html.find(".item-delete[data-item-id]").click(async e => {
        const id = e.currentTarget.dataset.itemId;
        await this.actor.items.get(id)?.delete();
      });
      // Удалить ref
      html.find(".item-delete[data-uuid]").click(async e => {
        const uuid  = e.currentTarget.dataset.uuid;
        const field = e.currentTarget.dataset.refField;
        const refs  = (this.actor.system[field] || []).filter(u => u !== uuid);
        await this.actor.update({ [`system.${field}`]: refs });
      });
      // Заблокировать embedded
      html.find(".container-item-lock[data-item-id]").change(async e => {
        const id     = e.currentTarget.dataset.itemId;
        const locked = e.currentTarget.checked;
        await this.actor.items.get(id)?.setFlag("kk9", "locked", locked);
      });
      // Заблокировать ref — храним в флагах актора контейнера
      html.find(".container-item-lock[data-uuid]").change(async e => {
        const uuid   = e.currentTarget.dataset.uuid;
        const locked = e.currentTarget.checked;
        const locks  = foundry.utils.deepClone(this.actor.getFlag("kk9","lockedRefs") || {});
        if (locked) locks[uuid] = true; else delete locks[uuid];
        await this.actor.setFlag("kk9", "lockedRefs", locks);
      });
    }

    // Забрать итем
    html.find(".btn-take-item").click(async e => {
      const itemId   = e.currentTarget.dataset.itemId;
      const uuid     = e.currentTarget.dataset.uuid;
      const refField = e.currentTarget.dataset.refField;

      const playerActor = game.user.character
        ?? canvas.tokens.controlled.find(t => t.actor?.type === "character")?.actor;
      if (!playerActor) {
        ui.notifications.warn("Нет персонажа. Назначь персонажа в настройках или выбери токен.");
        return;
      }

      if (uuid && refField) {
        // UUID-ссылка: добавляем к персонажу и убираем из контейнера
        const CHAR_REF_MAP = {
          artifact_refs: "artifact_refs",
          daemon_refs:   "daemon_refs",
          companion_refs:"companion_refs"
        };
        const charField = CHAR_REF_MAP[refField];
        const charRefs  = [...(playerActor.system[charField] || [])];
        if (!charRefs.includes(uuid)) charRefs.push(uuid);
        await playerActor.update({ [`system.${charField}`]: charRefs });

        const containerRefs = (this.actor.system[refField] || []).filter(u => u !== uuid);
        await this.actor.update({ [`system.${refField}`]: containerRefs });

        const doc = await fromUuid(uuid);
        ui.notifications.info(`${doc?.name ?? uuid} перемещён к ${playerActor.name}.`);

      } else if (itemId) {
        // Embedded item
        const item = this.actor.items.get(itemId);
        if (!item) return;

        const isGear = item.type === "gear";
        let qty = 1;
        if (isGear) {
          const qtyInput = html.find(`.container-take-qty[data-item-id="${itemId}"]`);
          qty = Math.max(1, Math.min(parseInt(qtyInput.val()) || 1, item.system.quantity || 1));
        }

        const itemData = item.toObject();
        if (isGear) itemData.system.quantity = qty;
        await Item.create(itemData, { parent: playerActor });

        if (isGear && (item.system.quantity || 1) > qty) {
          await item.update({ "system.quantity": (item.system.quantity || 1) - qty });
        } else {
          await item.delete();
        }
        ui.notifications.info(`${item.name} перемещён к ${playerActor.name}.`);
      }
    });

    // Забрать деньги
    html.find(".btn-take-money").click(async e => {
      const playerActor = game.user.character
        ?? canvas.tokens.controlled.find(t => t.actor?.type === "character")?.actor;
      if (!playerActor) {
        ui.notifications.warn("Нет персонажа.");
        return;
      }
      const amount = Math.max(1, parseInt(html.find(".container-take-money-input").val()) || 1);
      const avail  = this.actor.system.money || 0;
      const take   = Math.min(amount, avail);
      if (take <= 0) return;
      await this.actor.update({ "system.money": avail - take });
      await playerActor.update({ "system.money": (playerActor.system.money || 0) + take });
      ui.notifications.info(`${take}₽ перемещено к ${playerActor.name}.`);
    });

    // Инициатива
    html.find(".btn-container-initiative").click(async e => {
      const selId = html.find(".container-initiative-select").val();

      // Контейнер сам по себе — бросаем 1d6+1d6
      if (!selId || selId === "__container__") {
        const roll = new Roll("1d6 + 1d6");
        await roll.evaluate();
        const total   = roll.total;
        const actor   = this.actor;
        const portrait = actor.img || "icons/svg/mystery-man.svg";
        let diceRows = "";
        for (const term of roll.terms) {
          if (typeof term.faces !== "number") continue;
          const results = term.results ?? [];
          const vals = results.map(rv => `<span class="kk9-rv dk">${rv.result}</span>`).join("");
          const sum  = results.reduce((a,v) => a + v.result, 0);
          diceRows += `<div class="kk9-drow kept"><span class="kk9-dlabel">d${term.faces}</span><span class="kk9-dvals">${vals}</span><span class="kk9-dsum">= ${sum}</span></div>`;
        }
        diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div>`;
        const content = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${actor.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${actor.name}</span><span class="kk9-chat-label">Инициатива</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-initiative"><span class="kk9-result-text">${total}</span></summary><div class="kk9-dice-body">${diceRows}</div></details></div>`;
        if (game?.combat) {
          const cb = game.combat.combatants.find(c => c.actorId === actor.id);
          if (cb) await game.combat.setInitiative(cb.id, total);
        }
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { kk9: { isRoll: true } } });
        return;
      }

      // Даймон или спутник
      const initItems = [];
      for (const uuid of [...(this.actor.system.daemon_refs||[]), ...(this.actor.system.companion_refs||[])]) {
        const doc = await fromUuid(uuid);
        if (doc?.system?.attributes && !(doc.system.is_orb === true)) initItems.push(doc);
      }
      if (!initItems.length) return;
      const item = initItems.find(i => i.uuid === selId) || initItems[0];
      await this.actor.rollContainerInitiativeForItem(item);
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }

    // Даймон/спутник теперь акторы — принимаем Actor drag
    if (data.type === "Actor") {
      const actor = await fromUuid(data.uuid);
      if (!actor) return;
      if (actor.type !== "daemon" && actor.type !== "companion") {
        ui.notifications.warn(`Сюда можно перетащить только даймона или спутника.`);
        return;
      }
      const fieldMap = { daemon:"daemon_refs", companion:"companion_refs" };
      const field = fieldMap[actor.type];
      const refs  = [...(this.actor.system[field] || [])];
      if (refs.includes(actor.uuid)) {
        ui.notifications.warn(`«${actor.name}» уже в контейнере.`);
        return;
      }
      refs.push(actor.uuid);
      await this.actor.update({ [`system.${field}`]: refs });
      return;
    }

    if (data.type !== "Item") return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    // daemon/companion больше не Items — игнорируем если попал старый тип
    if (item.type === "daemon" || item.type === "companion") {
      ui.notifications.warn(`Даймоны и спутники теперь акторы — перетащи актора.`);
      return;
    }

    const ALLOWED = new Set([...EMBED_TYPES, "artifact"]);
    if (!ALLOWED.has(item.type)) {
      ui.notifications.warn(`Тип "${item.type}" нельзя положить в контейнер.`);
      return;
    }

    if (item.type === "artifact") {
      // UUID-ссылка
      const refs = [...(this.actor.system.artifact_refs || [])];
      if (refs.includes(item.uuid)) {
        ui.notifications.warn(`«${item.name}» уже в контейнере.`);
        return;
      }
      refs.push(item.uuid);
      await this.actor.update({ "system.artifact_refs": refs });
    } else {
      // Embedded copy
      await Item.create(item.toObject(), { parent: this.actor });
    }
  }
}
