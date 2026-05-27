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
    context.attributeLabels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
    context.attrLabels = { agility:"Ловк", smarts:"Смек", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };

    const allAbilities = this.actor.items.filter(i => i.type === "ability");

    context.attrDice = {
      agility:  context.system.attributes.agility.die,
      smarts:   context.system.attributes.smarts.die,
      spirit:   context.system.attributes.spirit.die,
      endurance: context.system.attributes.endurance.die,
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

    // Каждый ability попадает ровно в ОДИН список.
    // Приоритет: faculty → magic → base
    // faculty: явный faculty_id === facultyId
    const facultyItems = facultyId
      ? allAbilities.filter(i => i.system.faculty_id === facultyId)
      : [];
    context.facultyAbilities = facultyItems;
    const facultyIds = new Set(facultyItems.map(i => i.id));

    // magic: category === "magic" и НЕ в факультетском блоке
    // (магические с faculty_id остаются в факультетском блоке,
    //  но всегда попадают в magicAbilities для блока талантов на основной вкладке)
    context.magicAbilities = allAbilities.filter(i => i.system.category === "magic");
    const magicIds = new Set(context.magicAbilities.map(i => i.id));

    // base: всё остальное — не факультетское и не магическое
    context.baseSkills = allAbilities.filter(i =>
      !facultyIds.has(i.id) && !magicIds.has(i.id)
    );

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
    // Статус — обрабатываем здесь чтобы не было двойного fromUuid выше
    if (item.type === "status") {
      const { applyStatusToActor } = await import("./weapon-combat.mjs");
      await applyStatusToActor(this.actor, item);
      return;
    }
    if (item.type === "faculty") {
      // enrollInFaculty принимает id, но факультет может быть из компендиума —
      // поэтому применяем логику напрямую с готовым объектом
      const fData = item.system;
      // Сохраняем uuid — работает и для мировых предметов и для компендиумных
      const facultyRef = data.uuid || item.uuid || item.id;

      // Читаем старый факультет ДО update — после update this.actor.system.faculty уже изменится
      const oldFacultyRef = this.actor.system.faculty;

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
      // При смене факультета — обрабатываем старые факультетские способности
      if (oldFacultyRef && oldFacultyRef !== facultyRef) {
        const oldFacultyAbilities = this.actor.items.filter(
          i => i.type === "ability" && i.system.faculty_id === oldFacultyRef
        );
        for (const ab of oldFacultyAbilities) {
          const isMagic    = ab.system.category === "magic";
          const isUpgraded = ab.system.die > 4 || ab.system.modifier > -2;
          const isBase     = ab.system.isBase === true;
          if (isMagic || isUpgraded || isBase) {
            await ab.update({ "system.faculty_id": null });
          } else {
            await ab.delete();
          }
        }
      }
      // FIX: свежий список ПОСЛЕ всех await delete/update — snapshot до этой точки содержал уже удалённые объекты
      const existingAbilities = [...this.actor.items].filter(i => i.type === "ability");
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
      const _accent   = fData.color || "#c4a44a";
      const _portrait = this.actor.img || "icons/svg/mystery-man.svg";
      const _text     = teacherName
        ? `${this.actor.name} зачислен на ${item.name}.<br><em style="opacity:0.7;font-size:0.9em">Куратор ${teacherName} добавлен в связи.</em>`
        : `${this.actor.name} зачислен на ${item.name}.`;
      await ChatMessage.create({
        content: `<div class="kk9-chat-roll" data-result-type="success" style="--accent:${_accent}"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${_portrait}" alt="${this.actor.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:${_accent}">${this.actor.name}</span><span class="kk9-chat-label">Зачисление на факультет</span></div></div><div class="kk9-dice-body" style="padding:6px 10px;font-size:0.88em;color:#b8b0a4;line-height:1.5">${_text}</div></div>`,
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flags: { kk9: { isRoll: true, actorId: this.actor.id } }
      });
      return;
    }
    if (item.type === "language") {
      const langs = this.actor.system.languages || [];
      if (!langs.find(l => l.name === item.name))
        await this.actor.update({ "system.languages": [...langs, { name: item.name, itemId: item.id }] });
      return;
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
          const fi = await fromUuid(fid).catch(() => game.items.get(fid));
          if (fi && (fi.system.abilities || []).find(a => a.name === item.name))
            itemData.system.faculty_id = fid;
        }
      }
      await Item.create(itemData, { parent: this.actor });
      return;
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Цвет акцентов из факультета
    const facultyColor = this.actor.system?.faculty_color;
    if (facultyColor) {
      const form = (html[0]?.tagName === "FORM" ? html[0] : null) ?? html.find("form.kk9-sheet")[0] ?? html[0];
      if (form) {
        form.style.setProperty("--faculty-accent", facultyColor);
        form.style.setProperty("--faculty-accent-dim", facultyColor + "99");
        // Слайдеры связей — красим напрямую и через CSS var
        html.find(".relation-level-range").each(function() {
          this.style.accentColor = facultyColor;
          this.style.setProperty("accent-color", facultyColor);
        });
      }
    }

    html.find(".rollable-attribute").click(e => { e.stopPropagation(); this.actor.rollAttribute(e.currentTarget.dataset.attribute); });
    html.find(".rollable-skill").click(e => { e.stopPropagation(); this.actor.rollSkillItem(e.currentTarget.dataset.itemId); });
    html.find(".rollable-ability").click(e => { e.stopPropagation(); this.actor.rollAbility(e.currentTarget.dataset.itemId); });
    html.find(".roll-initiative").click(() => this.actor.rollInitiative());
    html.find(".roll-toughness").click(() => this.actor.rollToughness());

    // ── Создание персонажа ──
    html.find(".chargen-start-btn").click(() => _startChargen(this.actor));
    html.find(".chargen-skip-btn").click(async () => {
      await this.actor.update({ "system.character_created": true });
    });

    html.find(".health-pip[data-track='physical']").click(this._onPhysicalPipClick.bind(this));
    html.find(".health-pip[data-track='mental']").click(this._onMentalPipClick.bind(this));

    html.find(".item-name-click, .item-img").click(async e => {
      // Поддержка и embedded (data-item-id) и linked (data-uuid)
      const row = e.currentTarget.closest("[data-item-id], [data-uuid]");
      if (!row) return;
      if (row.dataset.uuid) {
        const doc = await fromUuid(row.dataset.uuid);
        // Сохраняем actorId на sheet объекте до рендера
        if (doc?.sheet) {
          doc.sheet._contextActorId = this.actor?.id;
          doc.sheet.render(true);
        }
      } else {
        this.actor.items.get(row.dataset.itemId)?.sheet.render(true);
      }
    });
    html.find(".item-create").click(this._onItemCreate.bind(this));

    // ── Артефакт: переключение экипировки и активности из строки ──
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
      // Перерисовываем лист персонажа чтобы иконки обновились
      this.render();
    });

    // ── Артефакт: кнопка применения из строки ──
    html.find(".artifact-use-btn").click(async e => {
      e.stopPropagation();
      const uuid   = e.currentTarget.dataset.uuid;
      const action = e.currentTarget.dataset.action;
      const doc    = await fromUuid(uuid);
      if (!doc) return;

      // Открываем sheet с контекстом актора и вызываем нужное действие
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
    // ── Weapon/Gear/Device/Spell: кнопка атаки из строки снаряжения ──
    html.find(".item-attack-btn").click(async e => {
      e.stopPropagation();
      const itemId   = e.currentTarget.dataset.itemId;
      const itemType = e.currentTarget.dataset.itemType;
      const item     = this.actor.items.get(itemId);
      if (!item) return;

      // Баг 6: проверяем экипировку (кроме спелла — там своя логика)
      if (itemType !== "spell" && item.system.equipped !== "equipped") {
        ui.notifications.warn(`${item.name}: не экипировано.`);
        return;
      }

      // Баг 7: списываем quantity/charges перед броском
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
      } else if (itemType === "device") {
        // Нормализуем поля: device использует attack_skill_uuid, rollWeaponAttack ждёт skill_uuid
        const proxy = new Proxy(item, {
          get(target, prop) {
            if (prop === "system") {
              return new Proxy(target.system, {
                get(sys, key) {
                  if (key === "skill_uuid") return sys.attack_skill_uuid;
                  if (key === "skill_name") return sys.attack_skill_name;
                  return sys[key];
                }
              });
            }
            return target[prop];
          }
        });
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(proxy, this.actor);
      } else {
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(item, this.actor);
      }
    });

    // ── Weapon/Gear/Device: переключатель экипировки из строки ──
    html.find(".item-equip-btn").click(async e => {
      e.stopPropagation();
      const itemId = e.currentTarget.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;
      const cycle  = { home: "carried", carried: "equipped", equipped: "home" };
      const cur    = item.system.equipped || "home";
      await item.update({ "system.equipped": cycle[cur] || "home" });
      this.render();
    });

    html.find(".item-delete").click(this._onItemDelete.bind(this));
    html.find(".btn-delete-skill").click(this._onItemDelete.bind(this));

    html.find(".skill-die-select").change(this._onSkillDieChange.bind(this));
    html.find(".skill-mod-input").change(async e => {
      if (!game.user.isGM) return;
      const itemId = e.currentTarget.dataset.itemId;
      await this.actor.items.get(itemId)?.update({ "system.modifier": parseInt(e.currentTarget.value) || 0 });
    });

    // Визуально блокируем контролы навыков/абилити для не-ГМ
    if (!game.user.isGM) {
      html.find(".ability-die-select, .ability-mod-input, .skill-die-select, .skill-mod-input")
          .prop("disabled", true).css("opacity", "0.5").css("cursor", "not-allowed");
    }

    html.find(".ability-die-select").change(async e => {
      if (!game.user.isGM) return;
      const itemId = e.currentTarget.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;
      let newDie = parseInt(e.currentTarget.value);
      const linkedAttr = item.system.linkedAttribute;
      if (linkedAttr) {
        const attrDie = this.actor.system.attributes?.[linkedAttr]?.die;
        if (attrDie && newDie > attrDie) {
          ui.notifications.warn(`Способность не может быть выше атрибута (d${attrDie}). Установлено d${attrDie}.`);
          newDie = attrDie;
          e.currentTarget.value = attrDie;
        }
      }
      await item.update({ "system.die": newDie });
    });
    html.find(".ability-mod-input").change(async e => {
      if (!game.user.isGM) return;
      const itemId = e.currentTarget.dataset.itemId;
      const item   = this.actor.items.get(itemId);
      if (!item) return;
      let newMod = parseInt(e.currentTarget.value) || 0;
      const linkedAttr = item.system.linkedAttribute;
      if (linkedAttr) {
        const attrMod = this.actor.system.attributes?.[linkedAttr]?.modifier ?? 0;
        if (newMod > attrMod) {
          ui.notifications.warn(`Модификатор способности не может быть выше модификатора атрибута (${attrMod}). Установлено ${attrMod}.`);
          newMod = attrMod;
          e.currentTarget.value = attrMod;
        }
      }
      await item.update({ "system.modifier": newMod });
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
      if (!game.user.isGM) return;
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
      if (!game.user.isGM) return;
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

  // Блокируем изменение энергии через форму для не-ГМ + cap на max
  _getSubmitData(updateData = {}) {
    const data = super._getSubmitData(updateData);
    if (!game.user.isGM) {
      delete data["system.energy.value"];
      delete data["system.money"];
      delete data["system.experience"];
      delete data["system.academy_year"];
      delete data["system.bennies"];
    } else if ("system.energy.value" in data) {
      const max = this.actor.system.energy?.max ?? 0;
      data["system.energy.value"] = Math.min(Math.max(0, data["system.energy.value"]), max);
    }
    return data;
  }
}

// ============================================================
// ITEM ЛИСТ
// ============================================================
export class KK9ItemSheet extends ItemSheet {
  // Если лист открыт из карточки актора — возвращаем того актора
  get contextActor() {
    if (this.item.actor) return this.item.actor;
    if (this._contextActorId) return game.actors.get(this._contextActorId);
    return null;
  }

  // Показывает диалог выбора актора у которого есть этот итем в refs
  async _pickActorForItem(silent = false) {
    const uuid = this.item.uuid;
    const refField = {
      artifact: "artifact_refs", daemon: "daemon_refs",
      companion: "companion_refs", contact: "contact_refs"
    }[this.item.type];

    // Собираем акторов у которых есть этот UUID и у которых есть права
    const candidates = game.actors.filter(a => {
      if (!a.testUserPermission(game.user, "OBSERVER")) return false;
      const refs = refField ? (a.system[refField] || []) : [];
      // Также проверяем embedded items
      const embedded = a.items?.some(i => i.uuid === uuid || i.id === this.item.id);
      return refs.includes(uuid) || embedded;
    });

    if (candidates.length === 0) {
      if (!silent) ui.notifications.warn("Нет доступных персонажей с этим предметом.");
      return null;
    }
    if (candidates.length === 1) return candidates[0];

    // Диалог выбора
    const options = candidates.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
    const actorId = await Dialog.prompt({
      title: "Применить к персонажу",
      content: `<div style="padding:8px">
        <p style="margin-bottom:8px">К кому применить?</p>
        <select id="pick-actor" style="width:100%">${options}</select>
      </div>`,
      label: "Применить",
      callback: html => html.find("#pick-actor").val()
    }).catch(() => null);

    return actorId ? game.actors.get(actorId) : null;
  }
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

    // Вычисляем справочный урон заклинания из cost для отображения в hbs
    if (this.item.type === "spell") {
      const cost  = this.item.system.cost || 0;
      const isAoe = this.item.system.is_aoe || false;
      let level, pips;
      if (isAoe) {
        if (cost <= 4)       { level = "light";  pips = 0; }
        else if (cost <= 8)  { level = "heavy";  pips = 0; }
        else if (cost <= 14) { level = "lethal"; pips = 0; }
        else                 { level = "lethal"; pips = Math.floor((cost - 14) / 8); }
      } else {
        if (cost <= 2)       { level = "light";  pips = 0; }
        else if (cost <= 6)  { level = "heavy";  pips = 0; }
        else if (cost <= 12) { level = "lethal"; pips = 0; }
        else                 { level = "lethal"; pips = Math.floor((cost - 12) / 6); }
      }
      const labels = { light: "Лёгкий (1 ур.)", heavy: "Тяжёлый (2 ур.)", lethal: "Летальный (3 ур.)" };
      context.spellDamageLabel = labels[level] + (pips ? ` +${pips} пип` : "");
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

    // ── Переключатель экипировки в карточке предмета (weapon/gear/device) ──
    html.find(".kk9-equip-toggle").click(async e => {
      e.preventDefault();
      const val = e.currentTarget.dataset.value;
      await this.item.update({ "system.equipped": val });
    });

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

    // ── Gear: атака и восстановление энергии ──
    if (this.item.type === "gear") {
      // Атака (только для gear_type === "attack")
      html.find(".gear-attack-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Снаряжение должно быть на карточке персонажа."); return; }
        if (this.item.system.equipped !== "equipped") { ui.notifications.warn("Снаряжение не экипировано."); return; }
        const qty = this.item.system.quantity ?? 1;
        if (qty <= 0) { ui.notifications.warn(`${this.item.name}: закончилось — атака невозможна.`); return; }
        await this.item.update({ "system.quantity": qty - 1 });
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(this.item, this.item.actor);
      });
      html.find(".gear-clear-skill").click(async () => {
        await this.item.update({ "system.skill_uuid": "", "system.skill_name": "" });
      });
      html.find(".gear-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
      // Drag & drop навыка на gear-skill-drop
      html.find(".gear-skill-drop").on("dragover", e => e.preventDefault());
      html.find(".gear-skill-drop").on("drop", async e => {
        e.preventDefault();
        const data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain") || "{}");
        if (!data.uuid) return;
        const dropped = await fromUuid(data.uuid);
        if (!dropped || ![ "skill","ability" ].includes(dropped.type)) {
          ui.notifications.warn("Перетащи навык или способность."); return;
        }
        await this.item.update({ "system.skill_uuid": dropped.uuid, "system.skill_name": dropped.name });
      });
      // Drag & drop статуса на gear-status-drop
      html.find(".gear-status-drop").on("dragover", e => e.preventDefault());
      html.find(".gear-status-drop").on("drop", async e => {
        e.preventDefault();
        const data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain") || "{}");
        if (!data.uuid) return;
        const dropped = await fromUuid(data.uuid);
        if (!dropped || dropped.type !== "status") {
          ui.notifications.warn("Перетащи статус-эффект."); return;
        }
        await this.item.update({ "system.status_uuid": dropped.uuid, "system.status_name": dropped.name });
      });

      html.find(".gear-use-energy-restore").click(async () => {
        const item  = this.item;
        if (item.system.equipped !== "equipped") { ui.notifications.warn("Нельзя применить — снаряжение не экипировано."); return; }
        const actor = await this._pickActorForItem();
        if (!actor) return;
        const base    = item.system.energy_restore || 0;
        const cond    = item.system.condition;
        if (cond === "broken")  { ui.notifications.warn("Снаряжение сломано — восстановление невозможно."); return; }
        const mult    = cond === "perfect" ? 1.5 : cond === "worn" ? 0.5 : 1;
        const restore = Math.floor(base * mult);
        const cur     = actor.system.energy?.value ?? 0;
        const max     = actor.system.energy?.max   ?? 0;
        const newVal  = Math.min(cur + restore, max);
        await actor.update({ "system.energy.value": newVal });
        ui.notifications.info(`${item.name}: восстановлено ${newVal - cur} ед. энергии.`);
      });
    }

    // ── Артефакт: атака ──
    if (this.item.type === "artifact") {
      html.find(".artifact-attack-roll").click(async () => {
        if (this.item.system.equipped !== "equipped") { ui.notifications.warn("Артефакт не экипирован."); return; }
        if (!this.item.system.active) { ui.notifications.warn("Артефакт не активен."); return; }
        // Пытаемся найти актора через диалог (для прокачанного навыка)
        // Если не нашли — бросаем без актора (world item навык)
        let actor = null;
        try { actor = await this._pickActorForItem(true); } catch(e) {}
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(this.item, actor);
      });
      html.find(".art-clear-skill").click(async () => {
        await this.item.update({ "system.skill_uuid": "", "system.skill_name": "" });
      });
      html.find(".art-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
      // Кнопки переключения состояния экипировки
      html.find(".art-equipped-btn").click(async e => {
        const val = e.currentTarget.dataset.value;
        await this.item.update({ "system.equipped": val });
      });

      html.find(".art-use-energy-restore").click(async () => {
        const item  = this.item;
        if (item.system.equipped !== "equipped") { ui.notifications.warn("Нельзя применить — артефакт не экипирован."); return; }
        if (!item.system.active) { ui.notifications.warn("Нельзя применить — артефакт не активен."); return; }
        const actor = await this._pickActorForItem();
        if (!actor) return;
        const base    = item.system.energy_restore || 0;
        if (!base) { ui.notifications.warn("У этого артефакта нет восстановления энергии."); return; }
        const cond    = item.system.condition;
        if (cond === "broken")  { ui.notifications.warn("Артефакт сломан — восстановление невозможно."); return; }
        const mult    = cond === "perfect" ? 1.5 : cond === "worn" ? 0.5 : 1;
        const restore = Math.floor(base * mult);
        const cur     = actor.system.energy?.value ?? 0;
        const max     = actor.system.energy?.max   ?? 0;
        const newVal  = Math.min(cur + restore, max);
        await actor.update({ "system.energy.value": newVal });
        ui.notifications.info(`${item.name}: восстановлено ${newVal - cur} ед. энергии.`);
      });
      html.find(".art-remove-skill-bonus").click(async e => {
        const uuid    = e.currentTarget.dataset.uuid;
        const bonuses = (this.item.system.skill_bonuses || []).filter(b => b.item_uuid !== uuid);
        await this.item.update({ "system.skill_bonuses": bonuses });
      });
    }

    // ── Заклинание ──
    if (this.item.type === "spell") {
      // Кнопка каста (только для spell_type === "attack")
      html.find(".spell-cast-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Заклинание должно быть на карточке персонажа."); return; }
        const { rollSpellAttack } = await import("./weapon-combat.mjs");
        await rollSpellAttack(this.item, this.item.actor);
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
      // Палочка-чекбокс — только GM может менять
      if (!game.user.isGM) {
        html.find(".sp-wand-checkbox").prop("disabled", true);
      }
      // GM-поле типа урона — показываем только GM
      if (game.user.isGM) {
        html.find(".sp-gm-damage-type").show();
      }
    }

    // ── Устройство ──
    if (this.item.type === "device") {
      html.find(".device-clear-skill").click(async () => {
        await this.item.update({ "system.bonus_skill_uuid": "", "system.bonus_skill_name": "" });
      });

      // ── Атака (только для device_type === "weapon") ──
      html.find(".device-attack-roll").click(async () => {
        if (!this.item.actor) { ui.notifications.warn("Устройство должно быть на карточке персонажа."); return; }
        if (this.item.system.equipped !== "equipped") { ui.notifications.warn("Устройство не экипировано."); return; }
        // Проверяем заряды (-1 = бесконечно)
        const charges = this.item.system.charges ?? -1;
        if (charges === 0) { ui.notifications.warn(`${this.item.name}: заряды закончились — атака невозможна.`); return; }
        if (charges > 0) await this.item.update({ "system.charges": charges - 1 });
        // Нормализуем поля: device использует attack_skill_uuid/name, rollWeaponAttack ждёт skill_uuid/name
        const proxy = new Proxy(this.item, {
          get(target, prop) {
            if (prop === "system") {
              return new Proxy(target.system, {
                get(sys, key) {
                  if (key === "skill_uuid") return sys.attack_skill_uuid;
                  if (key === "skill_name") return sys.attack_skill_name;
                  return sys[key];
                }
              });
            }
            return target[prop];
          }
        });
        const { rollWeaponAttack } = await import("./weapon-combat.mjs");
        await rollWeaponAttack(proxy, this.item.actor);
      });
      html.find(".device-clear-attack-skill").click(async () => {
        await this.item.update({ "system.attack_skill_uuid": "", "system.attack_skill_name": "" });
      });
      html.find(".device-clear-status").click(async () => {
        await this.item.update({ "system.status_uuid": "", "system.status_name": "" });
      });
      // Drag & drop навыка атаки
      html.find(".device-attack-skill-drop").on("dragover", e => e.preventDefault());
      html.find(".device-attack-skill-drop").on("drop", async e => {
        e.preventDefault();
        const data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain") || "{}");
        if (!data.uuid) return;
        const dropped = await fromUuid(data.uuid);
        if (!dropped || !["skill","ability"].includes(dropped.type)) {
          ui.notifications.warn("Перетащи навык или способность."); return;
        }
        await this.item.update({ "system.attack_skill_uuid": dropped.uuid, "system.attack_skill_name": dropped.name });
      });
      // Drag & drop статуса
      html.find(".device-status-drop").on("dragover", e => e.preventDefault());
      html.find(".device-status-drop").on("drop", async e => {
        e.preventDefault();
        const data = JSON.parse(e.originalEvent.dataTransfer.getData("text/plain") || "{}");
        if (!data.uuid) return;
        const dropped = await fromUuid(data.uuid);
        if (!dropped || dropped.type !== "status") {
          ui.notifications.warn("Перетащи статус-эффект."); return;
        }
        await this.item.update({ "system.status_uuid": dropped.uuid, "system.status_name": dropped.name });
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
        const LABELS = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
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

        // Навыки сопротивления — те же имена что у персонажа
        const resistNames = ["Сопротивление боли","Сопротивление магии","Сопротивление ментальному давлению","Самоконтроль","Выживание"];
        const available   = (this.item.system.skills || []).filter(sk => resistNames.includes(sk.name));
        const options     = available.map((sk, i) =>
          `<option value="${i}">${sk.name} (d${sk.die || 6})</option>`
        ).join("");

        let chosen = null;
        try {
          chosen = await Dialog.prompt({
            title: "Бросок Стойкости",
            content: `<div style="padding:8px">
              <p style="margin-bottom:8px">Дух${available.length ? " + навык сопротивления" : ""}</p>
              ${available.length
                ? `<select id="resist-skill" style="width:100%">
                     <option value="">— только Дух —</option>${options}
                   </select>`
                : "<em>Нет доступных навыков сопротивления</em>"}
            </div>`,
            label: "Бросить",
            callback: html => html.find("#resist-skill").val() || null
          });
        } catch(e) { return; }

        let formula, labelExtra = "", toughReasons = [];

        if (chosen !== null && chosen !== "") {
          const sk       = available[parseInt(chosen)];
          const skillDie = sk.die || 6;
          const skillMod = sk.modifier || 0;
          labelExtra     = ` + ${sk.name}`;
          const totalMod = spMod + skillMod;
          const spModStr = spMod !== 0 ? (spMod > 0 ? `+${spMod}` : `${spMod}`) : "";
          const skModStr = skillMod !== 0 ? (skillMod > 0 ? `+${skillMod}` : `${skillMod}`) : "";
          formula = `1d${spDie}x${spModStr} + 1d${skillDie}x${skModStr}`;
          if (totalMod) toughReasons.push(`мод. итого: ${totalMod > 0 ? "+" + totalMod : totalMod}`);
        } else {
          const modStr = spMod !== 0 ? (spMod > 0 ? `+${spMod}` : `${spMod}`) : "";
          formula = `1d${spDie}x${modStr}`;
          if (spMod) toughReasons.push(`мод.: ${modStr}`);
        }

        await _dmRoll(formula, `Стойкость${labelExtra}`, false, toughReasons);
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
        const LABELS = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
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

// ============================================================

// ============================================================
// СОЗДАНИЕ ПЕРСОНАЖА
// ============================================================


// ============================================================
// СОЗДАНИЕ ПЕРСОНАЖА — ChargenApp
// ============================================================
const ATTR_KEYS   = ["agility","smarts","spirit","endurance","magic"];
const ATTR_LABELS = {agility:"Ловкость",smarts:"Смекалка",spirit:"Дух",endurance:"Выносливость",magic:"Магия"};
const DIE_STEPS   = [4,6,8,10,12];
function _cgGet(key)  { return game.settings.get("kk9",key); }
function _dieIndex(d) { return DIE_STEPS.indexOf(d); }
function _dieLabel(d) { return `d${d}`; }
function _getBgDefs() {
  try { return JSON.parse(game.settings.get("kk9","chargen.backgrounds")); } catch {}
  return [
    {key:"ally",     label:"Союзник из прошлого", cost:2, desc:"НПС который встретит вас после События и будет доброжелателен."},
    {key:"artifact", label:"Артефакт",             cost:3, desc:"У вас есть артефакт — вы пока не знаете как он работает."},
    {key:"memory",   label:"Память о КК9",         cost:2, desc:"В детстве вы видели проявления КК9. Память стёрта — но вы вспомните."},
  ];
}

const CG_CSS = `
<style id="kk9-cg-style">
:root { --cg-bg:#1c1c1c; --cg-bg2:#232323; --cg-bg3:#2a2a2a;
        --cg-border:#3a3a3a; --cg-border2:#4a4a4a;
        --cg-text:#b8b0a4; --cg-dim:#6a6560; --cg-head:#d8d0c8;
        --cg-gold:#c4a44a; --cg-gold-d:#7a6430;
        --cg-accent:#c0392b; }
#kk9-chargen .window-header {
  background:var(--cg-bg) !important;
  border-bottom:1px solid var(--cg-border) !important;
  color:var(--cg-head) !important; }
#kk9-chargen .window-header .header-button {
  color:var(--cg-dim) !important; border:none !important; background:transparent !important; }
#kk9-chargen .window-header .header-button:hover { color:var(--cg-gold) !important; }
#kk9-chargen.app { border:1px solid var(--cg-border) !important;
  box-shadow:0 8px 32px rgba(0,0,0,.75) !important;
  background:var(--cg-bg2) !important; }
#kk9-chargen .window-content {
  background:var(--cg-bg2) !important; padding:0 !important;
  display:flex; flex-direction:column; overflow:hidden !important; }
.cg-body { flex:1; overflow-y:auto; overflow-x:hidden; padding:14px;
  scrollbar-width:thin; scrollbar-color:var(--cg-border) transparent; }
.cg-body::-webkit-scrollbar { width:4px; }
.cg-body::-webkit-scrollbar-thumb { background:var(--cg-border); border-radius:2px; }
.cg-footer { flex-shrink:0; display:flex; gap:8px; padding:10px 14px;
  background:var(--cg-bg) !important; border-top:1px solid var(--cg-border); }
.cg-btn { flex:1; padding:6px 10px; background:transparent;
  border:1px solid var(--cg-border2); border-radius:3px;
  color:var(--cg-text); cursor:pointer; font-family:'Jost',sans-serif;
  font-size:0.84em; transition:all .12s; }
.cg-btn:hover { border-color:var(--cg-gold-d); color:var(--cg-gold); }
.cg-btn.primary { border-color:var(--cg-gold-d); color:var(--cg-gold); }
.cg-btn.primary:hover { background:rgba(196,164,74,.1); }
.cg-step { font-size:.72em; color:var(--cg-gold-d); text-transform:uppercase;
  letter-spacing:.1em; border-bottom:1px solid var(--cg-border);
  padding-bottom:6px; margin-bottom:12px; }
.cg-pts { display:flex; align-items:center; justify-content:space-between;
  padding:6px 10px; background:var(--cg-bg3); border:1px solid var(--cg-border);
  border-radius:3px; margin-bottom:10px; font-size:.82em; color:var(--cg-text); }
.cg-pts-val { color:var(--cg-gold); font-size:1.1em; font-weight:600; }
.cg-field { display:flex; flex-direction:column; gap:3px; margin-bottom:8px; }
.cg-lbl { font-size:.72em; color:var(--cg-gold-d); text-transform:uppercase; letter-spacing:.08em; }
.cg-inp { background:var(--cg-bg3); border:1px solid var(--cg-border); border-radius:3px;
  color:var(--cg-head); padding:5px 8px; font-family:'Jost',sans-serif;
  font-size:.88em; width:100%; box-sizing:border-box; }
.cg-inp:focus { outline:none; border-color:var(--cg-gold-d); }
.cg-hint { font-size:.72em; color:var(--cg-dim); font-style:italic; margin-top:4px; }
.cg-arow { display:flex; align-items:center; gap:8px; padding:5px 8px;
  background:var(--cg-bg3); border:1px solid var(--cg-border);
  border-radius:3px; margin-bottom:4px; box-sizing:border-box; }
.cg-albl { flex:1; font-size:.84em; color:var(--cg-text); }
.cg-aval { width:36px; text-align:center; font-weight:600;
  color:var(--cg-gold); font-size:.9em; flex-shrink:0; }
.cg-pm { width:22px; height:22px; flex-shrink:0; background:transparent;
  border:1px solid var(--cg-border2); border-radius:3px;
  color:var(--cg-dim); cursor:pointer; font-size:.9em;
  display:flex; align-items:center; justify-content:center;
  transition:all .12s; padding:0; }
.cg-pm:hover:not([disabled]) { border-color:var(--cg-gold-d); color:var(--cg-gold); }
.cg-pm[disabled] { opacity:.25; cursor:not-allowed; }
.cg-save-block { margin-top:10px; padding:8px 10px; background:var(--cg-bg);
  border:1px dashed var(--cg-border2); border-radius:3px;
  display:flex; align-items:center; gap:8px; font-size:.8em; color:var(--cg-dim); }
.cg-act { padding:3px 12px; background:transparent;
  border:1px solid var(--cg-border2); border-radius:3px; color:var(--cg-dim);
  cursor:pointer; font-family:'Jost',sans-serif; font-size:.8em; transition:all .12s; }
.cg-act:hover:not([disabled]) { border-color:var(--cg-gold-d); color:var(--cg-gold); }
.cg-act[disabled] { opacity:.25; cursor:not-allowed; }
.cg-act.on { border-color:var(--cg-gold); color:var(--cg-gold); background:rgba(196,164,74,.08); }
.cg-sklist { display:flex; flex-direction:column; gap:3px; }
.cg-skrow { display:flex; align-items:center; gap:6px; padding:4px 8px;
  background:var(--cg-bg3); border:1px solid var(--cg-border);
  border-radius:3px; box-sizing:border-box; }
.cg-sknm { flex:1; font-size:.82em; color:var(--cg-text); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.cg-skattr { font-size:.72em; color:var(--cg-dim); flex-shrink:0; }
.cg-skval { width:62px; text-align:center; font-size:.8em;
  color:var(--cg-gold); flex-shrink:0; }
.cg-spec-row { display:flex; align-items:center; gap:8px; font-size:.8em; }
.cg-spec-n { color:var(--cg-gold); font-weight:600; }
.cg-bgrow { padding:8px 10px; background:var(--cg-bg3);
  border:1px solid var(--cg-border); border-radius:3px;
  margin-bottom:6px; box-sizing:border-box; }
.cg-bgrow.sel { border-color:var(--cg-gold-d); background:rgba(196,164,74,.06); }
.cg-bgrow.off { opacity:.4; }
.cg-bghead { display:flex; align-items:center; gap:8px; cursor:pointer; }
.cg-bgnm { flex:1; font-size:.86em; color:var(--cg-head); }
.cg-bgcost { font-size:.76em; color:var(--cg-dim); flex-shrink:0; }
.cg-bgdesc { font-size:.76em; color:var(--cg-dim); font-style:italic;
  margin:4px 0 0 24px; }
.cg-bgnote { width:100%; margin-top:6px; background:var(--cg-bg);
  border:1px solid var(--cg-border2); border-radius:3px; color:var(--cg-text);
  font-size:.8em; padding:4px 6px; font-family:'Jost',sans-serif;
  resize:none; box-sizing:border-box; }
</style>`;

class ChargenApp extends Application {
  constructor(actor, baseSkills) {
    super({ id:"kk9-chargen", title:"Создание персонажа", width:440, height:580, resizable:false });
    this.cgActor     = actor;
    this.cgSkills    = baseSkills;
    this.cgStep      = 1;
    this.cgState     = {};
    this._resolve    = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:"kk9-chargen", title:"Создание персонажа",
      width:440, height:580, resizable:false,
      classes:["app","window-app","kk9-cg-win"]
    });
  }

  // Инжектируем CSS один раз
  _injectCss() {
    if (!document.getElementById("kk9-cg-style"))
      document.head.insertAdjacentHTML("beforeend", CG_CSS);
  }

  async _renderInner() {
    this._injectCss();
    const body = this._buildStep(this.cgStep);
    const nav  = this._buildNav(this.cgStep);
    const el   = $(`<div style="display:flex;flex-direction:column;height:100%;">
      <div class="cg-body">${body}</div>
      <div class="cg-footer">${nav}</div>
    </div>`);
    this._bindEvents(el);
    return el;
  }

  // ── Билдеры шагов ──────────────────────────────────────────

  _buildStep(step) {
    if (step===1) return this._buildStep1();
    if (step===2) return this._buildStep2();
    if (step===3) return this._buildStep3();
    if (step===4) return this._buildStep4();
    return "";
  }

  _buildStep1() {
    const s=this.cgState, a=this.cgActor;
    return `<div class="cg-step">Шаг 1 / 4 — О себе</div>
      <div class="cg-field"><span class="cg-lbl">Имя</span>
        <input class="cg-inp" id="cg-name" type="text" value="${s.name||a.name}"/></div>
      <div class="cg-field"><span class="cg-lbl">Возраст</span>
        <input class="cg-inp" id="cg-age" type="number" min="1" value="${s.age||a.system.age||18}" style="width:90px"/></div>
      <div class="cg-field"><span class="cg-lbl">Гендер</span>
        <input class="cg-inp" id="cg-gender" type="text" value="${s.gender||a.system.gender||""}" placeholder="—"/></div>
      <div class="cg-field"><span class="cg-lbl">Место происхождения / проживания</span>
        <input class="cg-inp" id="cg-birthplace" type="text" value="${s.birthplace||a.system.birthplace||""}" placeholder="—"/></div>
      <p class="cg-hint">Данные можно изменить позже в карточке.</p>`;
  }

  _buildStep2() {
    const s=this.cgState, total=_cgGet("chargen.points.attributes");
    const maxDie=_cgGet("chargen.attr.max_die"), maxIdx=_dieIndex(maxDie);
    const conv=_cgGet("chargen.convert.attr_to_skill");
    if (!s.attrs) { s.attrs={}; s.attrSave=0; ATTR_KEYS.forEach(k=>s.attrs[k]=4); }
    const spent=ATTR_KEYS.reduce((n,k)=>n+_dieIndex(s.attrs[k]),0);
    const rem=total-spent-s.attrSave;
    const rows=ATTR_KEYS.map(k=>{
      const idx=_dieIndex(s.attrs[k]);
      return `<div class="cg-arow">
        <span class="cg-albl">${ATTR_LABELS[k]}</span>
        <button class="cg-pm" data-act="attr" data-key="${k}" data-dir="-1" ${idx===0?"disabled":""}>−</button>
        <span class="cg-aval">${_dieLabel(s.attrs[k])}</span>
        <button class="cg-pm" data-act="attr" data-key="${k}" data-dir="1" ${(rem<=0||idx>=maxIdx)?"disabled":""}>+</button>
      </div>`;
    }).join("");
    return `<div class="cg-step">Шаг 2 / 4 — Атрибуты (макс. ${_dieLabel(maxDie)})</div>
      <div class="cg-pts"><span>Очков атрибутов</span><span class="cg-pts-val">${rem} / ${total}</span></div>
      ${rows}
      <div class="cg-save-block">
        <span>Засолить 1 очко → ${conv} оч. навыков</span>
        <button class="cg-act${s.attrSave?" on":""}" data-act="save-toggle"
          ${!s.attrSave&&rem<=0?"disabled":""}>${s.attrSave?"✓ Засолено":"Засолить"}</button>
      </div>`;
  }

  _buildStep3() {
    const s=this.cgState, bsk=this.cgSkills;
    const conv=_cgGet("chargen.convert.attr_to_skill");
    const base=_cgGet("chargen.points.skills");
    const specCost=_cgGet("chargen.special.cost"), specMax=_cgGet("chargen.special.max");
    const start=base+(s.attrSave||0)*conv;
    if (!s.skills) {
      s.skills={}; s.specCount=0;
      bsk.forEach(sk=>{ s.skills[sk.id]={die:sk.system.die||4, modifier:sk.system.modifier??-2}; });
    }
    const spent=()=>{
      let n=s.specCount*specCost;
      bsk.forEach(sk=>{
        const oM=sk.system.modifier??-2, oD=sk.system.die||4, c=s.skills[sk.id];
        if (oM<0&&c.modifier>=0) n+=1;
        const oi=_dieIndex(oD),ci=_dieIndex(c.die);
        for(let i=oi;i<ci;i++) n+=DIE_STEPS[i]===4?1:2;
      });
      return n;
    };
    const rem=start-spent();
    const canUp=(sk,c)=>{
      const cost=c.modifier<0?1:(_dieIndex(c.die)===0?1:2);
      if(rem<cost)return false;
      if(c.modifier<0)return true;
      return c.die<(s.attrs[sk.system.linkedAttribute]??4);
    };
    const canDown=(sk,c)=>c.die>(sk.system.die||4)||c.modifier>(sk.system.modifier??-2);
    const rows=bsk.map(sk=>{
      const c=s.skills[sk.id], aD=s.attrs[sk.system.linkedAttribute]??4;
      const mStr=c.modifier<0?" −2":"";
      return `<div class="cg-skrow">
        <span class="cg-sknm">${sk.name}</span>
        <span class="cg-skattr">[${_dieLabel(aD)}]</span>
        <button class="cg-pm" data-act="sk" data-id="${sk.id}" data-dir="-1" ${!canDown(sk,c)?"disabled":""}>−</button>
        <span class="cg-skval">${_dieLabel(c.die)}${mStr}</span>
        <button class="cg-pm" data-act="sk" data-id="${sk.id}" data-dir="1" ${!canUp(sk,c)?"disabled":""}>+</button>
      </div>`;
    }).join("");
    const specLeft=specMax-s.specCount;
    return `<div class="cg-step">Шаг 3 / 4 — Навыки</div>
      <div class="cg-pts"><span>Очков навыков</span><span class="cg-pts-val">${rem} / ${start}</span></div>
      <div class="cg-sklist">${rows}</div>
      <div class="cg-save-block">
        <div class="cg-spec-row">
          <span>Спецспособность (−${specCost} оч.)</span>
          <button class="cg-act" data-act="spec-buy"
            ${(rem<specCost||specLeft<=0)?"disabled":""}>+ Запросить</button>
          ${s.specCount>0?`<span class="cg-spec-n">${s.specCount}/${specMax} запрошено</span>`:""}
        </div>
      </div>`;
  }

  _buildStep4() {
    const s=this.cgState, bgs=_getBgDefs();
    if (!s.bgs)     s.bgs={};
    if (!s.bgNotes) s.bgNotes={};
    const spent=bgs.filter(b=>s.bgs[b.key]).reduce((n,b)=>n+b.cost,0);
    const startPts=s.skillSave||0, rem=startPts-spent;
    const rows=bgs.map(b=>{
      const checked=!!s.bgs[b.key], canBuy=!checked&&rem>=b.cost;
      return `<div class="cg-bgrow${checked?" sel":""}${!canBuy&&!checked?" off":""}">
        <label class="cg-bghead">
          <input type="checkbox" data-act="bg" data-key="${b.key}"
            ${checked?"checked":""}${!canBuy&&!checked?" disabled":""}/>
          <span class="cg-bgnm">${b.label}</span>
          <span class="cg-bgcost">${b.cost} оч.</span>
        </label>
        <div class="cg-bgdesc">${b.desc}</div>
        ${checked?`<textarea class="cg-bgnote" data-key="${b.key}" rows="2"
          placeholder="Пожелания мастеру...">${s.bgNotes[b.key]||""}</textarea>`:""}
      </div>`;
    }).join("");
    return `<div class="cg-step">Шаг 4 / 4 — Бэкграунды</div>
      <div class="cg-pts"><span>Очков бэкграундов</span><span class="cg-pts-val">${rem} / ${startPts}</span></div>
      ${rows}`;
  }

  _buildNav(step) {
    const back   = step>1  ? `<button class="cg-btn" data-act="back">← Назад</button>` : "";
    const cancel = `<button class="cg-btn" data-act="cancel">Отмена</button>`;
    const fwd    = step<4
      ? `<button class="cg-btn primary" data-act="next">Далее →</button>`
      : `<button class="cg-btn primary" data-act="finish">Завершить ✓</button>`;
    return back + cancel + fwd;
  }

  // ── События ────────────────────────────────────────────────

  _bindEvents(el) {
    el.find("[data-act]").on("click change", async (ev) => {
      const t=ev.currentTarget, act=t.dataset.act;
      if (act==="cancel") { this.close(); this._resolve?.("cancel"); return; }
      if (act==="next")   { this._saveStep(el); this.cgStep++; await this.render(false); return; }
      if (act==="back")   { this.cgStep--; await this.render(false); return; }
      if (act==="finish") { this._saveStep(el); this._resolve?.("finish"); this.close(); return; }

      if (act==="attr") {
        const k=t.dataset.key, dir=parseInt(t.dataset.dir);
        const s=this.cgState, total=_cgGet("chargen.points.attributes");
        const maxIdx=_dieIndex(_cgGet("chargen.attr.max_die"));
        const sp=ATTR_KEYS.reduce((n,k2)=>n+_dieIndex(s.attrs[k2]),0);
        const rem=total-sp-s.attrSave;
        const idx=_dieIndex(s.attrs[k]);
        if(dir===1&&rem>0&&idx<maxIdx) s.attrs[k]=DIE_STEPS[idx+1];
        if(dir===-1&&idx>0) s.attrs[k]=DIE_STEPS[idx-1];
        await this.render(false); return;
      }
      if (act==="save-toggle") {
        this.cgState.attrSave=this.cgState.attrSave?0:1;
        await this.render(false); return;
      }
      if (act==="sk") {
        const id=t.dataset.id, dir=parseInt(t.dataset.dir);
        const c=this.cgState.skills[id];
        const sk=this.cgSkills.find(s=>s.id===id);
        const oD=sk?.system?.die||4, oM=sk?.system?.modifier??-2;
        if(dir===1){if(c.modifier<0)c.modifier=0;else{const i=_dieIndex(c.die);if(i<2)c.die=DIE_STEPS[i+1];}}
        else{if(c.die>oD)c.die=DIE_STEPS[_dieIndex(c.die)-1];else if(c.modifier>oM)c.modifier=oM;}
        await this.render(false); return;
      }
      if (act==="spec-buy") {
        const specMax=_cgGet("chargen.special.max");
        if(this.cgState.specCount<specMax) this.cgState.specCount++;
        await this.render(false); return;
      }
      if (act==="bg") {
        // Сохраняем заметки перед перерисовкой
        el.find(".cg-bgnote").each((_,ta)=>{ this.cgState.bgNotes[ta.dataset.key]=ta.value; });
        this.cgState.bgs[t.dataset.key]=t.checked;
        await this.render(false); return;
      }
    });
  }

  _saveStep(el) {
    const s=this.cgState, a=this.cgActor;
    if (this.cgStep===1) {
      s.name       = el.find("#cg-name").val().trim()||a.name;
      s.age        = parseInt(el.find("#cg-age").val())||18;
      s.gender     = el.find("#cg-gender").val().trim();
      s.birthplace = el.find("#cg-birthplace").val().trim();
    }
    if (this.cgStep===3) {
      const maxSave=_cgGet("chargen.skills.max_save");
      const conv=_cgGet("chargen.convert.attr_to_skill");
      const base=_cgGet("chargen.points.skills");
      const start=base+(s.attrSave||0)*conv;
      const spent=(()=>{
        let n=s.specCount*_cgGet("chargen.special.cost");
        this.cgSkills.forEach(sk=>{
          const oM=sk.system.modifier??-2,oD=sk.system.die||4,c=s.skills[sk.id];
          if(oM<0&&c.modifier>=0)n+=1;
          const oi=_dieIndex(oD),ci=_dieIndex(c.die);
          for(let i=oi;i<ci;i++)n+=DIE_STEPS[i]===4?1:2;
        });
        return n;
      })();
      s.skillSave=Math.min(start-spent, maxSave);
    }
    if (this.cgStep===4) {
      el.find(".cg-bgnote").each((_,ta)=>{ s.bgNotes[ta.dataset.key]=ta.value; });
    }
  }

  // Сохраняем скролл между рендерами
  async render(force) {
    const scrollTop = this.element?.find(".cg-body")[0]?.scrollTop ?? 0;
    await super.render(force);
    setTimeout(()=>{ this.element?.find(".cg-body")[0] && (this.element.find(".cg-body")[0].scrollTop=scrollTop); },0);
    return this;
  }
}

// ── Применить результат ───────────────────────────────────────
async function _applyChargen(actor, state, baseSkills) {
  await actor.update({
    name:state.name, "system.age":state.age,
    "system.gender":state.gender||"",
    "system.birthplace":state.birthplace||"",
    "system.character_created":true,
    ...Object.fromEntries(ATTR_KEYS.map(k=>[`system.attributes.${k}.die`,state.attrs[k]]))
  });
  for (const sk of baseSkills) {
    const cur=state.skills?.[sk.id], item=actor.items.get(sk.id);
    if (item&&cur) await item.update({"system.die":cur.die,"system.modifier":cur.modifier});
  }
  await _writeToMasterJournal(actor,state);
  ui.notifications.info(`${actor.name}: создание персонажа завершено!`);
}

async function _writeToMasterJournal(actor, state) {
  const journal=game.journal.find(j=>j.getFlag("kk9","isMasterJournal"));
  if (!journal) { console.warn("КК9 | Журнал «Мастерские дела» не найден."); return; }
  const bgDefs=_getBgDefs(), chosen=bgDefs.filter(b=>state.bgs?.[b.key]);
  let content="";
  if ((state.specCount||0)>0)
    content+=`<p><strong>Запрос спецспособностей:</strong> ${state.specCount} шт.</p>`;
  if (chosen.length)
    content+="<ul>"+chosen.map(b=>`<li><strong>${b.label}</strong>${state.bgNotes?.[b.key]?`: ${state.bgNotes[b.key]}`:""}</li>`).join("")+"</ul>";
  if (!content) content="<p>Нет запросов.</p>";
  const existing=journal.pages.find(p=>p.getFlag("kk9","actorId")===actor.id);
  if (existing) await existing.update({"text.content":content});
  else await journal.createEmbeddedDocuments("JournalEntryPage",[{
    name:actor.name,type:"text","text.content":content,"text.format":1,
    flags:{kk9:{actorId:actor.id}}
  }]);
}

// ── Старт ─────────────────────────────────────────────────────
async function _startChargen(actor) {
  let baseSkills=actor.items.filter(i=>i.type==="ability"&&i.system.isBase);
  if (!baseSkills.length) {
    const pack=game.packs.get("kk9.kk9-abilities");
    if (pack) {
      await pack.getIndex();
      const all=await Promise.all(Array.from(pack.index).map(i=>pack.getDocument(i._id)));
      baseSkills=all.filter(d=>d?.system?.isBase);
    }
  }
  if (!baseSkills.length) {
    ui.notifications.warn("Нет базовых навыков. Попроси мастера заполнить компендиум."); return;
  }
  return new Promise(resolve => {
    const app=new ChargenApp(actor, baseSkills);
    app._resolve = async (result) => {
      if (result==="finish") await _applyChargen(actor, app.cgState, baseSkills);
      resolve(result);
    };
    app.render(true);
  });
}
