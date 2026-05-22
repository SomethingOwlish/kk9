// ============================================================
// КК9 — Листы v1.6 (ИСПРАВЛЕНО: drag & drop)
// НПС-листы вынесены в module/npc-sheets.mjs
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
      // FIX: dropSelector охватывает всю форму — и sheet-body и sheet-sidebar (куда тащится факультет)
      dragDrop: [{ dragSelector: null, dropSelector: "form" }]
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

    const allSkills    = this.actor.items.filter(i => i.type === "ability");
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
    context.spells     = this.actor.items.filter(i => i.type === "spell");
    context.vehicles   = this.actor.items.filter(i => i.type === "vehicle");
    context.devices    = this.actor.items.filter(i => i.type === "device");
    context.languageItems = this.actor.items.filter(i => i.type === "language");

    // Ссылочные типы — резолвим UUID из system.*_refs
    const _resolveRefs = (field) =>
      (this.actor.system[field] || []).map(uuid => fromUuidSync(uuid)).filter(Boolean);
    context.artifacts  = _resolveRefs("artifact_refs");
    context.daemons    = _resolveRefs("daemon_refs");
    context.companions = _resolveRefs("companion_refs");
    context.contacts   = _resolveRefs("contact_refs");
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
    if (item.type === "faculty") {
      // enrollInFaculty принимает id, но факультет может быть из компендиума —
      // поэтому применяем логику напрямую с готовым объектом
      const fData = item.system;
      // Сохраняем uuid — работает и для мировых предметов и для компендиумных
      const facultyRef = data.uuid || item.uuid || item.id;
      await this.actor.update({
        "system.faculty":       facultyRef,
        "system.faculty_color": fData.color     || "",
        "system.faculty_key":   fData.color_key || "",
        "system.faculty_name":  item.name       || "",
      });
      // Куратор в связи
      const teacherName = fData.teacher || "";
      if (teacherName) {
        const rels = [...(this.actor.system.relations || [])];
        if (!rels.find(r => r.name === teacherName)) {
          rels.push({ name: teacherName, status: "neutral", level: 0, notes: "Куратор факультета", love: false });
          await this.actor.update({ "system.relations": rels });
        }
      }
      // Способности факультета
      const existingAbilities = this.actor.items.filter(i => i.type === "ability");
      for (const abilityRef of (fData.abilities || [])) {
        const existing = existingAbilities.find(a => a.name === abilityRef.name);
        if (existing) {
          await existing.update({ "system.faculty_id": facultyRef });
          continue;
        }
        let sourceItem = game.items.get(abilityRef.itemId);
        if (!sourceItem) {
          for (const pack of game.packs) {
            if (pack.documentName !== "Item") continue;
            sourceItem = await pack.getDocument(abilityRef.itemId).catch(() => null);
            if (sourceItem) break;
          }
        }
        if (sourceItem) {
          const itemData = sourceItem.toObject();
          itemData.system.faculty_id = facultyRef;
          await Item.create(itemData, { parent: this.actor });
        } else {
          await Item.create({
            name: abilityRef.name, type: "ability",
            system: { category: abilityRef.category || "common", faculty_id: facultyRef, description: "" }
          }, { parent: this.actor });
        }
      }
      ChatMessage.create({
        content: `<div style="font-family:'Jost',sans-serif;padding:6px 10px;border-left:3px solid ${fData.color || '#c9a84c'};background:rgba(0,0,0,0.3);color:#b8b0a4">
          <strong style="color:${fData.color || '#c9a84c'}">${this.actor.name}</strong> зачислен на <strong>${item.name}</strong>.
          ${teacherName ? `<br><em style="opacity:0.7">Куратор ${teacherName} добавлен в связи.</em>` : ""}
        </div>`,
        speaker: ChatMessage.getSpeaker({ actor: this.actor })
      });
      return;
    }
    if (item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.name === item.name))
        await this.actor.update({ "system.languages": [...langs, { name: item.name, itemId: item.id }] });
      return;
    }
    if (item.type === "ability") {
      const existing = this.actor.items.find(i => i.type === "ability" && i.name === item.name);
      if (existing) { ui.notifications.warn(`Способность "${item.name}" уже есть на карточке.`); return; }
      const itemData = item.toObject();
      await Item.create(itemData, { parent: this.actor }); return;
    }
    // Embedded copy: weapon, gear, spell, vehicle, device
    const embeddedTypes = ["weapon","gear","spell","vehicle","device"];
    if (embeddedTypes.includes(item.type)) return super._onDrop(event);

    // Ссылочные типы: artifact, daemon, companion, contact — хранить UUID
    const REF_FIELD = { artifact:"artifact_refs", daemon:"daemon_refs", companion:"companion_refs", contact:"contact_refs" };
    if (REF_FIELD[item.type]) {
      const field = REF_FIELD[item.type];
      const uuid  = item.uuid;
      const refs  = [...(this.actor.system[field] || [])];
      if (refs.includes(uuid)) { ui.notifications.warn(`«${item.name}» уже привязан к карточке.`); return; }
      refs.push(uuid);
      await this.actor.update({ [`system.${field}`]: refs });
      return;
    }
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

    html.find(".item-name-click, .item-img").click(async e => {
      // Поддержка и embedded (data-item-id) и linked (data-uuid)
      const row = e.currentTarget.closest("[data-item-id], [data-uuid]");
      if (!row) return;
      if (row.dataset.uuid) {
        const doc = await fromUuid(row.dataset.uuid);
        doc?.sheet?.render(true);
      } else {
        this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
      }
    });
    // Открытие abilities и statuses (у них rollable-ability/rollable-skill класс)
    html.find(".skill-name").dblclick(e => {
      const itemId = e.currentTarget.dataset.itemId;
      if (!itemId) return;
      this.actor.items.get(itemId)?.sheet.render(true);
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
      const itemId = e.currentTarget.dataset.itemId;
      await this.actor.items.get(itemId)?.update({ "system.die": parseInt(e.currentTarget.value) });
    });
    html.find(".ability-mod-input").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      await this.actor.items.get(itemId)?.update({ "system.modifier": parseInt(e.currentTarget.value) || 0 });
    });

    html.find(".attr-die-select").change(async e => {
      const attr = e.currentTarget.dataset.attribute;
      await this.actor.update({ [`system.attributes.${attr}.die`]: parseInt(e.currentTarget.value) });
    });

    html.find(".magic-level-select").change(async e => {
      const itemId = e.currentTarget.dataset.itemId;
      const level  = e.currentTarget.value;
      const levels = [...(this.actor.system.magicLevels || [])];
      const idx    = levels.findIndex(l => l.itemId === itemId);
      if (idx >= 0) levels[idx].level = level;
      else levels.push({ itemId, level });
      await this.actor.update({ "system.magicLevels": levels });
    });

    html.find(".love-toggle").click(this._onLoveToggle.bind(this));

    // Жетоны судьбы (bennies)
    html.find(".bennie-pip").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index); // 1-based
      const cur = this.actor.system.bennies ?? 0;
      const next = cur === idx ? idx - 1 : idx;
      await this.actor.update({ "system.bennies": Math.max(0, Math.min(9, next)) });
    });


    // Медитация
    html.find(".energy-meditate-btn").click(async () => {
      if (this.actor?.type !== "character") return;
      await this.actor.rollMeditation?.();
    });

    // Жетоны судьбы (bennies)
    html.find(".bennie-pip").click(async e => {
      const idx = parseInt(e.currentTarget.dataset.index); // 1-based
      const cur = this.actor.system.bennies ?? 0;
      // клик на активном пипе = уменьшить до (idx-1), иначе = установить idx
      const next = cur === idx ? idx - 1 : idx;
      await this.actor.update({ "system.bennies": Math.max(0, Math.min(9, next)) });
    });


    // Медитация — восстановить энергию
    html.find(".energy-meditate-btn").click(async () => {
      if (this.actor?.type !== "character") return;
      await this.actor.rollMeditation?.();
    });
    html.find(".add-relation, .btn-add-relation").click(this._onAddRelation.bind(this));
    html.find(".delete-relation, .btn-relation-delete").click(this._onDeleteRelation.bind(this));
    html.find(".relation-level-range").on("input", e => {
      const valEl = e.currentTarget.closest(".relation-row")?.querySelector(".relation-level-val");
      if (valEl) valEl.textContent = e.currentTarget.value;
    });

    html.find(".btn-delete-language, .delete-language").click(this._onDeleteLanguage.bind(this));

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
    const el   = event.currentTarget;
    const type = el.dataset.type;
    const cat  = el.dataset.category;
        const REF_FIELD = { artifact:"artifact_refs", daemon:"daemon_refs", companion:"companion_refs", contact:"contact_refs" };
    if (REF_FIELD[type]) {
      // Ссылочный тип — создаём в директории Items, затем привязываем UUID
      const typeLabels = { artifact:"Артефакт", daemon:"Даймон", companion:"Спутник", contact:"Контакт" };
      const newItem = await Item.create({ name: `Новый ${typeLabels[type] || type}`, type }, { parent: null });
      if (!newItem) return;
      const field = REF_FIELD[type];
      const refs  = [...(this.actor.system[field] || [])];
      refs.push(newItem.uuid);
      await this.actor.update({ [`system.${field}`]: refs });
      newItem.sheet.render(true);
      return;
    }
    // Embedded copy
    const data = { name: `Новый ${type}`, type };
    if (cat) data["system.category"] = cat;
    await Item.create(data, { parent: this.actor });
  }

  async _onItemDelete(event) {
    event.preventDefault();
    const el     = event.currentTarget;
    // Ссылочный тип — отвязать UUID, не удалять документ
    const uuid    = el.dataset.uuid || el.closest("[data-uuid]")?.dataset.uuid;
    const refType = el.dataset.refType || el.closest("[data-ref-type]")?.dataset.refType;
        const REF_FIELD = { artifact:"artifact_refs", daemon:"daemon_refs", companion:"companion_refs", contact:"contact_refs" };
    if (uuid && refType && REF_FIELD[refType]) {
      const field = REF_FIELD[refType];
      const refs  = (this.actor.system[field] || []).filter(r => r !== uuid);
      await this.actor.update({ [`system.${field}`]: refs });
      return;
    }
    // Embedded item — удалить
    const itemId = el.dataset.itemId || el.closest("[data-item-id]")?.dataset.itemId;
    if (itemId) await this.actor.items.get(itemId)?.delete();
  }

  async _onSkillDieChange(event) {
    const itemId   = event.currentTarget.dataset.itemId;
    const item     = this.actor.items.get(itemId);
    if (!item) return;
    let newDie = parseInt(event.currentTarget.value);
    const linkedAttr = item.system.linkedAttribute;
    if (linkedAttr) {
      const attrDie = this.actor.system.attributes?.[linkedAttr]?.die;
      if (attrDie && newDie > attrDie) {
        ui.notifications.warn(
          `Навык не может быть выше атрибута (d${attrDie}). Установлено d${attrDie}.`
        );
        newDie = attrDie;
        event.currentTarget.value = attrDie;
      }
    }
    await item.update({ "system.die": newDie });
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
// ITEM ЛИСТ
// ============================================================
export class KK9ItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["kk9","sheet","item"],
      width: 680, height: 700,
      tabs: [{ navSelector:".sheet-tabs", contentSelector:".sheet-body", initial:"description" }],
      // FIX: dropSelector = "form" чтобы _onDrop срабатывал при дропе на любой дочерний элемент
      dragDrop: [{ dragSelector: null, dropSelector: "form" }]
    });
  }

  get template() { return `systems/kk9/templates/items/${this.item.type}-sheet.hbs`; }

  getData() {
    const context = super.getData();
    context.system = context.data.system;
    context.isGM   = game.user.isGM;
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
      {value:"government",label:"Правительственная"},
      {value:"magical",label:"Магическая"},
      {value:"corporate",label:"Корпоративная"},{value:"underground",label:"Подпольная"},
      {value:"other",label:"Прочая"}
    ];
    if (this.item.type === "daemon") {
      context.daemonItems = this.item.system.skills ?? [];
    }

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
        if (target.classList.contains("weapon-skill-drop") && ["ability"].includes(item.type)) {
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

    // ── Артефакт: drag-drop навыка, статуса, бонуса к навыку ──
    if (this.item.type === "artifact") {
      const target = event.target.closest(".artifact-skill-drop, .artifact-status-drop, .artifact-skill-bonus-drop");
      if (target) {
        if (data.type !== "Item") return;
        const item = await fromUuid(data.uuid);
        if (!item) return;
        if (target.classList.contains("artifact-skill-drop") && ["ability"].includes(item.type)) {
          await this.item.update({ "system.skill_uuid": item.uuid, "system.skill_name": item.name });
          return;
        }
        if (target.classList.contains("artifact-status-drop") && item.type === "status") {
          await this.item.update({ "system.status_uuid": item.uuid, "system.status_name": item.name });
          return;
        }
        if (target.classList.contains("artifact-skill-bonus-drop") && ["ability"].includes(item.type)) {
          const bonuses = [...(this.item.system.skill_bonuses || [])];
          if (!bonuses.find(b => b.item_uuid === item.uuid)) {
            bonuses.push({ item_uuid: item.uuid, item_name: item.name, bonus: 1 });
            await this.item.update({ "system.skill_bonuses": bonuses });
          }
          return;
        }
        return;
      }
    }

    // ── Заклинание: drag-drop навыка, статуса, бонуса к навыку ──
    if (this.item.type === "spell") {
      const target = event.target.closest(".spell-skill-drop, .spell-status-drop, .spell-skill-bonus-drop");
      if (target) {
        if (data.type !== "Item") return;
        const item = await fromUuid(data.uuid);
        if (!item) return;
        if (target.classList.contains("spell-skill-drop") && ["ability"].includes(item.type)) {
          await this.item.update({ "system.skill_uuid": item.uuid, "system.skill_name": item.name });
          return;
        }
        if (target.classList.contains("spell-status-drop") && item.type === "status") {
          await this.item.update({ "system.status_uuid": item.uuid, "system.status_name": item.name });
          return;
        }
        if (target.classList.contains("spell-skill-bonus-drop") && ["ability"].includes(item.type)) {
          const bonuses = [...(this.item.system.skill_bonuses || [])];
          if (!bonuses.find(b => b.item_uuid === item.uuid)) {
            bonuses.push({ item_uuid: item.uuid, item_name: item.name, bonus: 1 });
            await this.item.update({ "system.skill_bonuses": bonuses });
          }
          return;
        }
        return;
      }
    }

    // ── Даймон: drag-drop навыков и способностей ──
    if (this.item.type === "daemon") {
      const target = event.target.closest(".daemon-items-drop");
      if (target && data.type === "Item") {
        const item = await fromUuid(data.uuid);
        if (!item || !["ability"].includes(item.type)) return;
        const skills = foundry.utils.deepClone(this.item.system.skills || []);
        if (!skills.find(sk => sk.uuid === item.uuid || sk.name === item.name)) {
          skills.push({ uuid: item.uuid, name: item.name, type: item.type,
            die: item.system?.die || 6, modifier: item.system?.modifier || 0 });
          await this.item.update({ "system.skills": skills });
        }
        return;
      }
    }

    // ── Устройство: drag-drop бонусного навыка ──
    if (this.item.type === "device") {
      const target = event.target.closest(".device-skill-drop");
      if (target && data.type === "Item") {
        const item = await fromUuid(data.uuid);
        if (!item || !["ability"].includes(item.type)) return;
        await this.item.update({ "system.bonus_skill_uuid": item.uuid, "system.bonus_skill_name": item.name });
        return;
      }
    }

    // ── Контакт: участники, бывшие, события ──
    if (this.item.type === "contact") {
      const target = event.target.closest(".contact-members-drop, .contact-former-drop, .contact-events-drop");
      if (!target) return super._onDrop(event);

      if (target.classList.contains("contact-members-drop")) {
        if (data.type !== "Actor") return;
        const actor = await fromUuid(data.uuid);
        if (!actor) return;
        const members = [...(this.item.system.members || [])];
        if (members.find(m => m.actor_uuid === data.uuid)) return;
        members.push({ actor_uuid: data.uuid, actor_name: actor.name });
        await this.item.update({ "system.members": members });
        return;
      }
      if (target.classList.contains("contact-former-drop")) {
        if (data.type !== "Actor") return;
        const actor = await fromUuid(data.uuid);
        if (!actor) return;
        const former = [...(this.item.system.former_members || [])];
        if (former.find(m => m.actor_uuid === data.uuid)) return;
        former.push({ actor_uuid: data.uuid, actor_name: actor.name, comment: "" });
        await this.item.update({ "system.former_members": former });
        return;
      }
      if (target.classList.contains("contact-events-drop")) {
        if (data.type !== "JournalEntry") return;
        const journal = await fromUuid(data.uuid);
        if (!journal) return;
        const events = [...(this.item.system.events || [])];
        if (events.find(e => e.uuid === data.uuid)) return;
        events.push({ uuid: data.uuid, name: journal.name });
        await this.item.update({ "system.events": events });
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
      if (!item || !["ability"].includes(item.type)) return;
      const abilities = [...(this.item.system.abilities || [])];
      if (!abilities.find(a => a.itemId === item.id)) {
        abilities.push({ name: item.name, itemId: item.id, category: item.system.category || "learned" });
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

    // ── Артефакт: атака ──
    if (this.item.type === "artifact") {
      html.find(".artifact-attack-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Артефакт должен быть на карточке персонажа."); return; }
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(this.item, this.item.actor);
      });
      html.find(".art-clear-skill").click(async () => {
        await this.item.update({ "system.skill_uuid": "", "system.skill_name": "" });
      });
      html.find(".art-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
      html.find(".art-remove-skill-bonus").click(async e => {
        const uuid    = e.currentTarget.dataset.uuid;
        const bonuses = (this.item.system.skill_bonuses || []).filter(b => b.item_uuid !== uuid);
        await this.item.update({ "system.skill_bonuses": bonuses });
      });
    }

    // ── Заклинание ──
    if (this.item.type === "spell") {
      html.find(".spell-attack-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Заклинание должно быть на карточке персонажа."); return; }
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(this.item, this.item.actor);
      });
      html.find(".sp-clear-skill").click(async () => {
        await this.item.update({ "system.skill_uuid": "", "system.skill_name": "" });
      });
      html.find(".sp-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
      html.find(".sp-remove-skill-bonus").click(async e => {
        const uuid    = e.currentTarget.dataset.uuid;
        const bonuses = (this.item.system.skill_bonuses || []).filter(b => b.item_uuid !== uuid);
        await this.item.update({ "system.skill_bonuses": bonuses });
      });
    }

    // ── Устройство ──
    if (this.item.type === "device") {
      html.find(".device-clear-skill").click(async () => {
        await this.item.update({ "system.bonus_skill_uuid": "", "system.bonus_skill_name": "" });
      });
    }

    // ── Спутник: пипы привязанности, здоровья и инициатива ──
    if (this.item.type === "companion") {
      // Атрибут спутника
      html.find(".cp-attr-roll").click(async e => {
        e.stopPropagation();
        const attrKey = e.currentTarget.dataset.attr;
        const attr    = this.item.system.attributes?.[attrKey];
        if (!attr) return;
        const LABELS = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
        const die    = attr.die || 6;
        const mod    = attr.modifier || 0;
        const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
        const roll   = new Roll(`1d${die}x${modStr}`);
        await roll.evaluate();
        const total  = roll.total;
        let deg;
        if (total <= 1) deg = { cls:"kk9-result-snake", lbl:"Глаза змеи" };
        else if (total < 6) deg = { cls:"kk9-result-failure", lbl:"Неудача" };
        else { const sc = 1+Math.floor((total-6)/4); deg = { cls:"kk9-result-success", lbl: sc===1?"1 успех":sc<=4?`${sc} успеха`:`${sc} успехов` }; }
        const portrait = this.item.img || "icons/svg/mystery-man.svg";
        const results  = roll.terms[0]?.results ?? [];
        const diceRows = results.map(r=>`<div class="kk9-drow kept"><span class="kk9-dlabel">d${die}</span><span class="kk9-dvals"><span class="kk9-rv dk">${r.exploded?"💥":""}${r.result}</span></span><span class="kk9-dsum">= ${r.result}</span></div>`).join("");
        const modRow   = mod ? `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ мод.: ${modStr}</span></div>` : "";
        const content  = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${this.item.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${this.item.name}</span><span class="kk9-chat-label">${LABELS[attrKey]||attrKey}</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary ${deg.cls}"><span class="kk9-result-text">${deg.lbl}</span></summary><div class="kk9-dice-body">${diceRows}${modRow}<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div></div></details></div>`;
        await ChatMessage.create({ speaker: { alias: this.item.name }, content, flags: { kk9: { isRoll: true } } });
      });

      // Bond pips
      html.find(".cp-bond-pip").click(async e => {
        const val     = parseInt(e.currentTarget.dataset.value);
        const cur     = this.item.system.bond ?? 1;
        const newBond = cur === val ? Math.max(1, val - 1) : val;
        await this.item.update({ "system.bond": newBond });
      });
      html.find(".companion-hp-pip").click(async e => {
        const val = parseInt(e.currentTarget.dataset.value);
        const cur = this.item.system.health?.value ?? 0;
        await this.item.update({ "system.health.value": cur === val ? Math.max(1, val - 1) : val });
      });
      html.find(".companion-roll-initiative").click(async () => {
        const attrs  = this.item.system.attributes || {};
        const agDie  = attrs.agility?.die || 6;
        const smDie  = attrs.smarts?.die  || 6;
        const mod    = (attrs.agility?.modifier||0) + (attrs.smarts?.modifier||0);
        const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
        const formula = `1d${agDie}x + 1d${smDie}x${modStr}`;
        const roll    = new Roll(formula);
        await roll.evaluate();
        const portrait = this.item.img || "icons/svg/mystery-man.svg";
        const total    = roll.total;
        // Build dice HTML — formula is additive (no pool), iterate terms
        let diceRows = "";
        for (const term of roll.terms) {
          if (typeof term.faces !== "number") continue;
          const results = term.results ?? [];
          const vals = results.map(rv => `<span class="kk9-rv dk">${rv.exploded?"💥":""}${rv.result}</span>`).join("");
          const sum  = results.reduce((a, v) => a + v.result, 0);
          diceRows += `<div class="kk9-drow kept"><span class="kk9-dlabel">d${term.faces}</span><span class="kk9-dvals">${vals}</span><span class="kk9-dsum">= ${sum}</span></div>`;
        }
        if (mod) diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ мод.: ${modStr}</span></div>`;
        diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div>`;
        const content = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${this.item.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${this.item.name}</span><span class="kk9-chat-label">Инициатива</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-initiative"><span class="kk9-result-text">${total}</span></summary><div class="kk9-dice-body">${diceRows}</div></details></div>`;
        const actor = this.item.actor;
        if (actor && game?.combat) {
          const cb = game.combat.combatants.find(c => c.actorId === actor.id);
          if (cb) await game.combat.setInitiative(cb.id, total);
        }
        await ChatMessage.create({ speaker: { alias: this.item.name }, content, flags: { kk9: { isRoll: true } } });
      });
    }

    // ── Даймон: инициатива и стойкость ──
    if (this.item.type === "daemon") {
      const _dmRoll = async (formula, label, isInit = false, reasons = []) => {
        const roll = new Roll(formula);
        await roll.evaluate();
        const portrait = this.item.img || "icons/svg/mystery-man.svg";
        const name     = this.item.name;
        const total    = roll.total;
        // Dice rows
        const buildDice = (r) => {
          const pool = r.terms.find(t => Array.isArray(t.rolls));
          const rows = [];
          if (pool) {
            pool.rolls.forEach((pr, i) => {
              const disc = pool.results?.[i]?.active === false;
              const die  = pr.terms?.find(t => typeof t.faces === "number");
              if (!die) return;
              const vals = (die.results||[]).map(rv => `<span class="kk9-rv ${disc?"dr":"dk"}">${rv.exploded?"💥":""}${rv.result}</span>`).join("");
              const sum  = disc ? "" : `<span class="kk9-dsum">= ${(die.results||[]).reduce((a,v)=>a+v.result,0)}</span>`;
              rows.push(`<div class="kk9-drow ${disc?"discarded":"kept"}"><span class="kk9-dlabel">d${die.faces}</span><span class="kk9-dvals">${vals}</span>${sum}</div>`);
            });
          } else {
            r.terms.filter(t => typeof t.faces === "number").forEach(die => {
              const vals = (die.results||[]).map(rv => `<span class="kk9-rv dk">${rv.exploded?"💥":""}${rv.result}</span>`).join("");
              rows.push(`<div class="kk9-drow kept"><span class="kk9-dlabel">d${die.faces}</span><span class="kk9-dvals">${vals}</span><span class="kk9-dsum">= ${(die.results||[]).reduce((a,v)=>a+v.result,0)}</span></div>`);
            });
          }
          if (reasons.length) {
            rows.push(`<div class="kk9-dsep"></div>`);
            reasons.forEach(r => rows.push(`<div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ ${r}</span></div>`));
          }
          rows.push(`<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div>`);
          return rows.join("");
        };
        const diceBody = buildDice(roll);
        let resultBar;
        if (isInit) {
          resultBar = `<details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-initiative"><span class="kk9-result-text">${total}</span></summary><div class="kk9-dice-body">${diceBody}</div></details>`;
        } else {
          const t = total; let deg;
          if (t <= 1) deg = { cls:"kk9-result-snake", lbl:"Глаза змеи" };
          else if (t < 6) deg = { cls:"kk9-result-failure", lbl:"Неудача" };
          else { const sc = 1+Math.floor((t-6)/4); deg = { cls:"kk9-result-success", lbl: sc===1?"1 успех":sc<=4?`${sc} успеха`:`${sc} успехов` }; }
          resultBar = `<details class="kk9-result-details"><summary class="kk9-result-summary ${deg.cls}"><span class="kk9-result-text">${deg.lbl}</span></summary><div class="kk9-dice-body">${diceBody}</div></details>`;
        }
        const content = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${name}</span><span class="kk9-chat-label">${label}</span></div></div>${resultBar}</div>`;
        // Combat tracker
        const actor = this.item.actor;
        if (isInit && actor && game?.combat) {
          const cb = game.combat.combatants.find(c => c.actorId === actor.id);
          if (cb) await game.combat.setInitiative(cb.id, total);
        }
        await ChatMessage.create({ speaker: { alias: name }, content, flags: { kk9: { isRoll: true } } });
      };

      html.find(".daemon-roll-initiative").click(async () => {
        const attrs  = this.item.system.attributes || {};
        const agDie  = attrs.agility?.die || 6;
        const smDie  = attrs.smarts?.die  || 6;
        const mod    = (attrs.agility?.modifier||0) + (attrs.smarts?.modifier||0);
        const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
        const initReasons = mod ? [`мод.: ${modStr}`] : [];
        await _dmRoll(`1d${agDie}x + 1d${smDie}x${modStr}`, "Инициатива", true, initReasons);
      });

      html.find(".daemon-roll-toughness").click(async () => {
        const attrs  = this.item.system.attributes || {};
        const spDie  = attrs.spirit?.die || 6;
        const spMod  = attrs.spirit?.modifier || 0;
        const modStr = spMod ? (spMod>0?`+${spMod}`:`${spMod}`) : "";
        const toughReasons = spMod ? [`мод.: ${modStr}`] : [];
        await _dmRoll(`1d${spDie}x${modStr}`, "Стойкость", false, toughReasons);
      });
    }

    // ── Даймон: клик по навыку/способности для броска ──
    if (this.item.type === "daemon") {
      // Health pips
      // Health pips — используем делегирование по data-track
      html.find(".health-pip").click(async e => {
        const track = e.currentTarget.dataset.track;
        const val   = parseInt(e.currentTarget.dataset.value);
        if (track === "daemon-physical") {
          const cur = this.item.system.health?.physical?.value ?? 0;
          await this.item.update({ "system.health.physical.value": cur === val ? Math.max(0, val-1) : val });
        } else if (track === "daemon-mental") {
          const cur = this.item.system.health?.mental?.value ?? 0;
          await this.item.update({ "system.health.mental.value": cur === val ? Math.max(0, val-1) : val });
        }
      });
      // Бросок атрибута даймона
      html.find(".dm-attr-roll").click(async e => {
        e.stopPropagation();
        const attrKey = e.currentTarget.dataset.attr;
        const attr    = this.item.system.attributes?.[attrKey];
        if (!attr) return;
        const LABELS = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
        const die    = attr.die || 6;
        const mod    = attr.modifier || 0;
        const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
        const formula = `1d${die}x${modStr}`;
        const roll = new Roll(formula);
        await roll.evaluate();
        const total = roll.total;
        let deg;
        if (total <= 1) deg = { cls:"kk9-result-snake", lbl:"Глаза змеи" };
        else if (total < 6) deg = { cls:"kk9-result-failure", lbl:"Неудача" };
        else { const sc = 1+Math.floor((total-6)/4); deg = { cls:"kk9-result-success", lbl: sc===1?"1 успех":sc<=4?`${sc} успеха`:`${sc} успехов` }; }
        const portrait = this.item.img || "icons/svg/mystery-man.svg";
        const results  = roll.terms[0]?.results ?? [];
        const diceRows = results.map(r=>`<div class="kk9-drow kept"><span class="kk9-dlabel">d${die}</span><span class="kk9-dvals"><span class="kk9-rv dk">${r.exploded?"💥":""}${r.result}</span></span><span class="kk9-dsum">= ${r.result}</span></div>`).join("");
        const modRows  = mod ? `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ мод.: ${modStr}</span></div>` : "";
        const content  = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${this.item.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${this.item.name}</span><span class="kk9-chat-label">${LABELS[attrKey]||attrKey}</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary ${deg.cls}"><span class="kk9-result-text">${deg.lbl}</span></summary><div class="kk9-dice-body">${diceRows}${modRows}<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div></div></details></div>`;
        await ChatMessage.create({ speaker: { alias: this.item.name }, content, flags: { kk9: { isRoll: true } } });
      });

      // Бросок навыка/способности — standalone, без actor
      html.find(".dm-rollable").click(async e => {
        const idx  = parseInt(e.currentTarget.dataset.index);
        const sk   = this.item.system.skills?.[idx];
        if (!sk) return;
        const die    = sk.die || 6;
        const mod    = sk.modifier || 0;
        const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
        const roll   = new Roll(`1d${die}x${modStr}`);
        await roll.evaluate();
        // Строим сообщение как у НПС (успехи)
        const THRESH = 6;
        const total  = roll.total;
        let degree;
        if (total <= 1) degree = { type:"snake_eyes", label:"Глаза змеи" };
        else if (total < THRESH) degree = { type:"failure", label:"Неудача" };
        else { const s = 1 + Math.floor((total - THRESH) / 4); degree = { type:"success", label: s===1?"1 успех":s<=4?`${s} успеха`:`${s} успехов` }; }
        const portrait = this.item.img || "icons/svg/mystery-man.svg";
        const nameClr  = "#c4a44a";
        const cls = degree.type === "success" ? "kk9-result-success" : degree.type === "snake_eyes" ? "kk9-result-snake" : "kk9-result-failure";
        // Dice HTML
        const results = roll.terms[0]?.results ?? [];
        let diceRows = results.map(r => `<div class="kk9-drow kept"><span class="kk9-dlabel">d${die}</span><span class="kk9-dvals"><span class="kk9-rv dk">${r.exploded?"💥":""}${r.result}</span></span><span class="kk9-dsum">= ${r.result}</span></div>`).join("");
        if (mod) diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ мод.: ${modStr}</span></div>`;
        const content = [
          `<div class="kk9-chat-roll" style="--accent:#c4a44a">`,
          `  <div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${this.item.name}">`,
          `  <div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:${nameClr}">${this.item.name}</span>`,
          `  <span class="kk9-chat-label">${sk.name}</span></div></div>`,
          `  <details class="kk9-result-details"><summary class="kk9-result-summary ${cls}">`,
          `    <span class="kk9-result-text">${degree.label}</span></summary>`,
          `    <div class="kk9-dice-body">${diceRows}<div class="kk9-dsep"></div>`,
          `    <div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div></div>`,
          `  </details></div>`
        ].join("\n");
        await ChatMessage.create({ speaker: { alias: this.item.name }, content,
          flags: { kk9: { isRoll: true } } });
      });
      // Удалить навык
      html.find(".dm-skill-del").click(async e => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const skills = [...(this.item.system.skills || [])];
        skills.splice(idx, 1);
        await this.item.update({ "system.skills": skills });
      });
      // Изменить die
      html.find(".dm-skill-die").change(async e => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const skills = foundry.utils.deepClone(this.item.system.skills || []);
        if (skills[idx]) { skills[idx].die = parseInt(e.currentTarget.value); await this.item.update({ "system.skills": skills }); }
      });
      // Изменить modifier
      html.find(".dm-skill-mod").change(async e => {
        const idx = parseInt(e.currentTarget.dataset.index);
        const skills = foundry.utils.deepClone(this.item.system.skills || []);
        if (skills[idx]) { skills[idx].modifier = parseInt(e.currentTarget.value)||0; await this.item.update({ "system.skills": skills }); }
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

    // ── Контакт: удалить участника, бывшего, событие ──
    html.find(".contact-remove-member").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.members": (this.item.system.members || []).filter(m => m.actor_uuid !== uuid) });
    });
    html.find(".contact-remove-former").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.former_members": (this.item.system.former_members || []).filter(m => m.actor_uuid !== uuid) });
    });
    html.find(".contact-remove-event").click(async e => {
      const uuid = e.currentTarget.dataset.uuid;
      await this.item.update({ "system.events": (this.item.system.events || []).filter(ev => ev.uuid !== uuid) });
    });
  }
}
