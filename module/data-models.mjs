// ============================================================
// КК9 — Дата-модели v1.2 (0.9.0)
// ============================================================

const { fields } = foundry.data;

function attributeField() {
  return new fields.SchemaField({
    die:      new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
  });
}

function npcAttributeField() {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial: 6, choices: [4, 6, 8, 10, 12, 20, 100], integer: true })
  });
}

function activeStatusesField() {
  // Display-cache для быстрого рендера в карточке актора.
  // Полные данные статуса живут в actor.items (embedded Item type="status").
  return new fields.ArrayField(
    new fields.SchemaField({
      itemId:         new fields.StringField({ required: true, initial: "" }),
      statusName:     new fields.StringField({ initial: "" }),
      status_types:   new fields.ArrayField(new fields.StringField({ initial: "" })),
      duration_mode:  new fields.StringField({ initial: "time" }),
      duration_value: new fields.NumberField({ initial: 1, integer: true }),
    })
  );
}

function npcCommonFields() {
  return {
    role:           new fields.StringField({ initial: "" }),
    age:            new fields.StringField({ initial: "" }),
    race:           new fields.StringField({ initial: "" }),
    gender:         new fields.StringField({ initial: "" }),
    world_origin:   new fields.StringField({ initial: "" }),
    country_origin: new fields.StringField({ initial: "" }),
    world_home:     new fields.StringField({ initial: "" }),
    country_home:   new fields.StringField({ initial: "" }),
    organizations:  new fields.StringField({ initial: "" }),
    goals:          new fields.StringField({ initial: "" }),
    motives:        new fields.StringField({ initial: "" }),
    appearance:     new fields.StringField({ initial: "" }),
    notes:          new fields.StringField({ initial: "" }),
    biography:      new fields.HTMLField({ initial: "" }),
    relations: new fields.ArrayField(
      new fields.SchemaField({
        name:   new fields.StringField({ initial: "" }),
        status: new fields.StringField({ initial: "neutral", choices: ["ally","enemy","neutral","unknown"] }),
        level:  new fields.NumberField({ initial: 0, min: -15, max: 15, integer: true }),
        notes:  new fields.StringField({ initial: "" }),
        love:   new fields.BooleanField({ initial: false })
      })
    ),
    attributes: new fields.SchemaField({
      agility:  npcAttributeField(),
      smarts:   npcAttributeField(),
      spirit:   npcAttributeField(),
      endurance: npcAttributeField(),
      magic:    npcAttributeField(),
    }),
    toughness: new fields.NumberField({ initial: 5, integer: true }),
    energy: new fields.SchemaField({
      value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ required: true, initial: 10, integer: true })
    }),
    active_statuses: activeStatusesField(),
    // Счётчик урона сверх обеих шкал (от заклинаний)
    overflow_damage: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    // Ссылочные типы (UUID — не embedded copies)
    artifact_refs:  new fields.ArrayField(new fields.StringField({ initial: "" })),
    daemon_refs:    new fields.ArrayField(new fields.StringField({ initial: "" })),
    companion_refs: new fields.ArrayField(new fields.StringField({ initial: "" })),
    contact_refs:   new fields.ArrayField(new fields.StringField({ initial: "" })),
    // KK9 связь
    kk9_linked:             new fields.BooleanField({ initial: false }),
    operative_class:        new fields.StringField({ initial: "" }),
    operative_faculty_color: new fields.StringField({ initial: "" }),
    languages: new fields.ArrayField(
      new fields.SchemaField({
        name:   new fields.StringField({ required: true, initial: "" }),
        itemId: new fields.StringField({ initial: "" })
      })
    ),
  };
}

// ============================================================
// ПЕРСОНАЖ
// ============================================================
export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      biography:      new fields.HTMLField({ initial: "" }),
      biography_text: new fields.StringField({ initial: "" }),
      age:            new fields.NumberField({ required: true, initial: 18, min: 0, integer: true }),
      academy_year:   new fields.StringField({ initial: "1" }),
      birthplace:     new fields.StringField({ initial: "" }),
      dormitory:      new fields.StringField({ initial: "" }),
      gender:         new fields.StringField({ initial: "" }),
      height:         new fields.StringField({ initial: "" }),
      build:          new fields.StringField({ initial: "" }),
      allergies:      new fields.StringField({ initial: "" }),
      weaknesses:     new fields.StringField({ initial: "" }),
      notes:          new fields.StringField({ initial: "" }),
      gm_notes:       new fields.StringField({ initial: "" }),
      faculty:        new fields.StringField({ initial: null, nullable: true, blank: false }),
      faculty_color:  new fields.StringField({ initial: "" }),
      faculty_key:    new fields.StringField({ initial: "" }),
      faculty_name:   new fields.StringField({ initial: "" }),
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        endurance: attributeField(),
        magic:    attributeField(),
      }),
      skills: new fields.SchemaField({}),
      customSkills: new fields.ArrayField(
        new fields.SchemaField({
          name:            new fields.StringField({ required: true, initial: "" }),
          die:             new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier:        new fields.NumberField({ initial: 0, integer: true })
        })
      ),
      languages: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          itemId: new fields.StringField({ initial: "" })
        })
      ),
      magicLevels: new fields.ArrayField(
        new fields.SchemaField({
          itemId: new fields.StringField({ required: true, initial: "" }),
          level:  new fields.StringField({ initial: "sparks", choices: ["sparks","normal","exceptional"] })
        })
      ),
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value:     new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        will: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 10, integer: true }),
          max:   new fields.NumberField({ required: true, initial: 10, integer: true })
        })
      }),
      energy: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ required: true, initial: 22, integer: true })
      }),
      bennies:    new fields.NumberField({ required: true, initial: 3, min: 0, max: 9, integer: true }),
      money:      new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      experience: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      relations: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          status: new fields.StringField({ initial: "neutral", choices: ["ally","enemy","neutral","unknown"] }),
          level:  new fields.NumberField({ initial: 0, min: -15, max: 15, integer: true }),
          notes:  new fields.StringField({ initial: "" }),
          love:   new fields.BooleanField({ initial: false })
        })
      ),
      active_statuses: activeStatusesField(),
      // Счётчик урона сверх обеих шкал (от заклинаний)
      overflow_damage: new fields.NumberField({ initial: 0, min: 0, integer: true }),

      // Ссылки на связанные документы (UUID — не embedded copies)
      artifact_refs:  new fields.ArrayField(new fields.StringField({ initial: "" })),
      daemon_refs:    new fields.ArrayField(new fields.StringField({ initial: "" })),
      companion_refs: new fields.ArrayField(new fields.StringField({ initial: "" })),
      contact_refs:   new fields.ArrayField(new fields.StringField({ initial: "" })),
      // Флаг завершения создания персонажа
      character_created: new fields.BooleanField({ initial: false }),
    };
  }

  prepareDerivedData() {
    this.health.physical.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    this.energy.max = this.age + this.attributes.spirit.die;
    // Постоянный модификатор max энергии от статусов (type=energy, mode=max)
    if (this.parent?.items) {
      const mod = this.parent.items
        .filter(i => i.type === "status")
        .flatMap(i => i.system?.effects ?? [])
        .filter(e => e.enabled && e.type === "energy" && e.energy?.mode === "max")
        .reduce((s, e) => s + (e.energy?.amount ?? 0), 0);
      if (mod !== 0) this.energy.max = Math.max(0, this.energy.max + mod);
    }
  }
}

// ============================================================
// НПС ЛЁГКИЙ — 2 ячейки + Отключка
// ============================================================
export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...npcCommonFields(),
      // Лёгкий НПС: пипы 1, 3, 5 — max=5 как у Hard
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        })
      }),
    };
  }
  prepareDerivedData() {
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    const ageNum = parseInt(this.age) || 0;
    this.energy.max = ageNum + this.attributes.spirit.die;
    // Постоянный модификатор max энергии от статусов (type=energy, mode=max)
    if (this.parent?.items) {
      const mod = this.parent.items
        .filter(i => i.type === "status")
        .flatMap(i => i.system?.effects ?? [])
        .filter(e => e.enabled && e.type === "energy" && e.energy?.mode === "max")
        .reduce((s, e) => s + (e.energy?.amount ?? 0), 0);
      if (mod !== 0) this.energy.max = Math.max(0, this.energy.max + mod);
    }
  }
}

// ============================================================
// НПС СЛОЖНЫЙ — 5 ячеек
// ============================================================
export class NpcHardDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...npcCommonFields(),
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        })
      }),
    };
  }
  prepareDerivedData() {
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    const ageNum = parseInt(this.age) || 0;
    this.energy.max = ageNum + this.attributes.spirit.die;
    // Постоянный модификатор max энергии от статусов (type=energy, mode=max)
    if (this.parent?.items) {
      const mod = this.parent.items
        .filter(i => i.type === "status")
        .flatMap(i => i.system?.effects ?? [])
        .filter(e => e.enabled && e.type === "energy" && e.energy?.mode === "max")
        .reduce((s, e) => s + (e.energy?.amount ?? 0), 0);
      if (mod !== 0) this.energy.max = Math.max(0, this.energy.max + mod);
    }
  }
}

// ============================================================
// НПС НЕПОБЕДИМЫЙ — нет шкал, дикий кубик
// ============================================================
export class NpcBossDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...npcCommonFields(),
      special_mechanics: new fields.StringField({ initial: "" }),
      wild_die: new fields.NumberField({ initial: 6, choices: [4,6,8,10,12], integer: true }),
    };
  }
  prepareDerivedData() {
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    const ageNum = parseInt(this.age) || 0;
    this.energy.max = ageNum + this.attributes.spirit.die;
    // Постоянный модификатор max энергии от статусов (type=energy, mode=max)
    if (this.parent?.items) {
      const mod = this.parent.items
        .filter(i => i.type === "status")
        .flatMap(i => i.system?.effects ?? [])
        .filter(e => e.enabled && e.type === "energy" && e.energy?.mode === "max")
        .reduce((s, e) => s + (e.energy?.amount ?? 0), 0);
      if (mod !== 0) this.energy.max = Math.max(0, this.energy.max + mod);
    }
  }
}

// ============================================================
// ПРЕДМЕТЫ
// ============================================================

export class FacultyDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:      new fields.HTMLField({ initial: "" }),
      color:            new fields.StringField({ initial: "#888888" }),
      color_key:        new fields.StringField({ initial: "" }),
      teacher:          new fields.StringField({ initial: "" }),
      active:           new fields.BooleanField({ initial: true }),
      date_founded:     new fields.StringField({ initial: "" }),
      date_reformed:    new fields.StringField({ initial: "" }),
      dormitory:        new fields.StringField({ initial: "" }),
      predecessor_uuid: new fields.StringField({ initial: "" }),
      predecessor_name: new fields.StringField({ initial: "" }),
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name:     new fields.StringField({ required: true, initial: "" }),
          itemId:   new fields.StringField({ initial: "" }),
          category: new fields.StringField({ initial: "common", choices: ["common","personal","learned","magic"] })
        })
      ),
      students: new fields.ArrayField(
        new fields.SchemaField({
          actorUuid:   new fields.StringField({ required: true, initial: "" }),
          studentName: new fields.StringField({ initial: "" }),
          course:      new fields.NumberField({ initial: 1, min: 1, max: 5, integer: true }),
          semester:    new fields.NumberField({ initial: 1, min: 1, max: 2, integer: true }),
          isStar:      new fields.BooleanField({ initial: false })
        })
      ),
      dropouts: new fields.ArrayField(
        new fields.SchemaField({
          actorUuid:   new fields.StringField({ required: true, initial: "" }),
          studentName: new fields.StringField({ initial: "" }),
          reason:      new fields.StringField({ initial: "" })
        })
      ),
      traits_fit:    new fields.HTMLField({ initial: "" }),
      traits_unfit:  new fields.HTMLField({ initial: "" }),
      special_rules: new fields.HTMLField({ initial: "" }),
      lore_entries: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true, initial: "" }),
          name: new fields.StringField({ initial: "" })
        })
      ),
    };
  }

  migrateData(source) {
    if (Array.isArray(source.students)) {
      source.students = source.students.map(s => {
        if (s.name !== undefined && !s.studentName) {
          s.studentName = s.name;
          delete s.name;
        }
        return s;
      });
    }
    if (Array.isArray(source.dropouts)) {
      source.dropouts = source.dropouts.map(d => {
        if (d.name !== undefined && !d.studentName) {
          d.studentName = d.name;
          delete d.name;
        }
        return d;
      });
    }
    return super.migrateData(source);
  }
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:     new fields.HTMLField({ initial: "" }),
      category:        new fields.StringField({ initial: "common", choices: ["common","personal","learned","magic"] }),
      linkedAttribute: new fields.StringField({ initial: "smarts", choices: ["agility","smarts","spirit","endurance","magic"] }),
      faculty_id:      new fields.StringField({ initial: null, nullable: true, blank: false }),
      die:             new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
      modifier:        new fields.NumberField({ initial: -2, integer: true }),
      isBase:          new fields.BooleanField({ initial: false })
    };
  }
}

// ── WeaponDataModel — заменить существующий (добавлено поле condition) ──
export class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:  new fields.HTMLField({ initial: "" }),
      skill_uuid:   new fields.StringField({ initial: "" }),
      skill_name:   new fields.StringField({ initial: "" }),
      damage_level: new fields.StringField({ initial: "light",   choices: ["light","heavy","lethal"] }),
      damage_type:  new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
      range:        new fields.NumberField({ initial: 0, integer: true }),
      size:         new fields.StringField({ initial: "medium",  choices: ["pocket","finger","small","medium","large","huge","immovable"] }),
      ap:           new fields.NumberField({ initial: 0, integer: true }),
      rof:          new fields.NumberField({ initial: 1, integer: true }),
      equipped:     new fields.StringField({ initial: "home", choices: ["home","carried","equipped"] }),
      condition:    new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),
      attack_modifier:  new fields.NumberField({ initial: 0, integer: true }),
      condition_chance: new fields.NumberField({ initial: 0, min: 0, max: 100, integer: true }),
      has_status:   new fields.BooleanField({ initial: false }),
      status_uuid:  new fields.StringField({ initial: "" }),
      status_name:  new fields.StringField({ initial: "" }),
      notes:        new fields.StringField({ initial: "" })
    };
  }
}

// ── GearDataModel — заменить существующий ──
export class GearDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.HTMLField({ initial: "" }),
      gear_type:   new fields.StringField({ initial: "utility", choices: ["attack","defense","utility"] }),
      size:        new fields.StringField({ initial: "medium",  choices: ["pocket","finger","small","medium","large","huge","immovable"] }),
      condition:   new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),
      quantity:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
      equipped:    new fields.StringField({ initial: "home", choices: ["home","carried","equipped"] }),
      // Восстановление энергии (для зелий и утилит)
      energy_restore: new fields.NumberField({ initial: 0, min: 0, integer: true }),
      // ── Атакующие поля (только для gear_type === "attack") ──
      damage_level:    new fields.StringField({ initial: "light", choices: ["light","heavy","lethal"] }),
      damage_type:     new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
      skill_uuid:      new fields.StringField({ initial: "" }),
      skill_name:      new fields.StringField({ initial: "" }),
      attack_modifier: new fields.NumberField({ initial: 0, integer: true }),
      condition_chance: new fields.NumberField({ initial: 0, min: 0, max: 100, integer: true }),
      has_status:      new fields.BooleanField({ initial: false }),
      status_uuid:     new fields.StringField({ initial: "" }),
      status_name:     new fields.StringField({ initial: "" }),
    };
  }
}

export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:        new fields.HTMLField({ initial: "" }),

      // Тип артефакта
      artifact_type: new fields.StringField({
        initial: "utility",
        choices: ["attack","defense","binding","spatial","utility","buff","transforming","prophetic","ring"]
      }),

      // Класс
      artifact_class: new fields.StringField({
        initial: "simple",
        choices: ["simple","complex"]
      }),
      artifact_age: new fields.NumberField({ initial: 0, integer: true }),

      // Редкость — добавлен "ancient"
      rarity: new fields.StringField({
        initial: "common",
        choices: ["common","uncommon","rare","unique","ancient"]
      }),

      // Создатель и условие активации
      creator:           new fields.StringField({ initial: "" }),
      activation_condition: new fields.StringField({ initial: "" }),

      // Поля кольца (artifact_type === "ring")
      ring_material: new fields.StringField({ initial: "" }),
      ring_stone:    new fields.StringField({ initial: "" }),

      // Размер
      size: new fields.StringField({
        initial: "small",
        choices: ["pocket","finger","small","medium","large","huge","immovable"]
      }),

      // Состояние
      equipped:   new fields.StringField({ initial: "home", choices: ["home","carried","equipped"] }),
      condition:  new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),
      active:     new fields.BooleanField({ initial: false }),
      destroyed:  new fields.BooleanField({ initial: false }),

      // Бонусы к атрибутам (если бафф/экипирован+активен)
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        endurance:  new fields.NumberField({ initial: 0, integer: true }),
        magic:     new fields.NumberField({ initial: 0, integer: true }),
        toughness: new fields.NumberField({ initial: 0, integer: true })
      }),

      // Бонусы к навыкам/способностям — drag-drop массив
      skill_bonuses: new fields.ArrayField(
        new fields.SchemaField({
          item_uuid: new fields.StringField({ required: true, initial: "" }),
          item_name: new fields.StringField({ initial: "" }),
          bonus:     new fields.NumberField({ initial: 1, integer: true })
        })
      ),

      // Атакующие параметры (только для artifact_type === "attack")
      damage_level: new fields.StringField({
        initial: "light",
        choices: ["light","heavy","lethal"]
      }),
      damage_type: new fields.StringField({
        initial: "physical",
        choices: ["physical","mental"]
      }),
      skill_uuid:       new fields.StringField({ initial: "" }),
      skill_name:       new fields.StringField({ initial: "" }),
      attack_modifier:  new fields.NumberField({ initial: 0, integer: true }),
      condition_chance: new fields.NumberField({ initial: 0, min: 0, max: 100, integer: true }),

      // Статус при попадании (только для attack)
      has_status:  new fields.BooleanField({ initial: false }),
      status_uuid: new fields.StringField({ initial: "" }),
      status_name: new fields.StringField({ initial: "" }),

      // Восстановление энергии при использовании
      energy_restore: new fields.NumberField({ initial: 0, min: 0, integer: true }),
    };
  }
}

export class SpellDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Стоимость энергии
      cost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),

      // Дальность в метрах
      range: new fields.NumberField({ initial: 0, integer: true }),

      // Длительность в ходах (-1 = постоянное, 0 = мгновенное)
      duration: new fields.NumberField({ initial: 0, integer: true }),

      // Тип/класс заклинания
      spell_type: new fields.StringField({
        initial: "attack",
        choices: ["attack","defense","binding","spatial","utility","buff","transforming","prophetic"]
      }),

      // Визуальный цвет эффекта
      effect_color: new fields.StringField({ initial: "#a855f7" }),

      // Описание визуального эффекта
      effect_description: new fields.StringField({ initial: "" }),

      // Можно применять без волшебной палочки
      no_wand_needed: new fields.BooleanField({ initial: false }),

      // Площадное заклинание (иная таблица cost→damage, GM-диалог целей)
      is_aoe: new fields.BooleanField({ initial: false }),

      // Навык-тип магии — drag-drop магического навыка/способности
      skill_uuid: new fields.StringField({ initial: "" }),
      skill_name: new fields.StringField({ initial: "" }),

      // ── АТАКУЮЩИЕ ПОЛЯ (spell_type === "attack") ──
      // damage_level — только readonly-справка, реальный урон считается из cost
      damage_level: new fields.StringField({
        initial: "light",
        choices: ["light","heavy","lethal"]
      }),
      // damage_type — для attack отображается всем, для остальных скрыт (только GM)
      damage_type: new fields.StringField({
        initial: "physical",
        choices: ["physical","mental"]
      }),
      has_status:  new fields.BooleanField({ initial: false }),
      status_uuid: new fields.StringField({ initial: "" }),
      status_name: new fields.StringField({ initial: "" }),

      // ── БАФФ ПОЛЯ (spell_type === "buff") ──
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        endurance:  new fields.NumberField({ initial: 0, integer: true }),
        magic:     new fields.NumberField({ initial: 0, integer: true }),
        toughness: new fields.NumberField({ initial: 0, integer: true })
      }),
      skill_bonuses: new fields.ArrayField(
        new fields.SchemaField({
          item_uuid: new fields.StringField({ required: true, initial: "" }),
          item_name: new fields.StringField({ initial: "" }),
          bonus:     new fields.NumberField({ initial: 1, integer: true })
        })
      ),
    };
  }
}

// ============================================================
// ДАЙМОН — Actor (был Item)
// ============================================================
export class DaemonActorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:  new fields.HTMLField({ initial: "" }),

      // Режим: шарик или свободен
      is_orb:       new fields.BooleanField({ initial: true }),

      // Настоящее имя
      true_name:    new fields.StringField({ initial: "" }),

      // Корпорация
      corporation:  new fields.StringField({
        initial: "taro",
        choices: ["taro", "rainbow", "new"]
      }),

      // Класс
      daemon_class:   new fields.StringField({ initial: "1" }),
      major_arcana:   new fields.StringField({ initial: "Дурак" }),

      // Масть (только Таро)
      suit: new fields.StringField({
        initial: "cups",
        choices: ["cups", "wands", "swords", "pentacles"]
      }),

      // Цвет
      color: new fields.StringField({
        initial: "white",
        choices: ["black","white","gold","silver","red","orange","green","blue","purple","yellow","pink","pearl","grey"]
      }),

      appearance: new fields.StringField({ initial: "" }),
      dream:      new fields.StringField({ initial: "" }),
      fear:       new fields.StringField({ initial: "" }),
      desire:     new fields.StringField({ initial: "" }),

      // Режим шарик
      captor: new fields.StringField({ initial: "" }),
      used:   new fields.BooleanField({ initial: false }),

      // Режим свободный
      gone: new fields.BooleanField({ initial: false }),

      // Здоровье (5+5 пипов как у сложного НПС)
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        })
      }),

      // Атрибуты
      attributes: new fields.SchemaField({
        agility:   new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        smarts:    new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        spirit:    new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        endurance: new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        magic:     new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
      }),

      // Навыки (массив, как было)
      skills: new fields.ArrayField(
        new fields.SchemaField({
          uuid:     new fields.StringField({ initial: "" }),
          name:     new fields.StringField({ initial: "" }),
          type:     new fields.StringField({ initial: "skill" }),
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true }),
        })
      ),

      condition: new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),

      // Кто владелец (UUID актора-персонажа или контейнера)
      owner_id: new fields.StringField({ initial: "" }),

      // Стойкость — вычисляется из spirit
      toughness: new fields.NumberField({ initial: 5, integer: true }),

      // Статусы — embedded Items типа status (как у акторов)
      active_statuses: activeStatusesField(),
    };
  }

  prepareDerivedData() {
    this.toughness = 2 + Math.floor((this.attributes.spirit.die ?? 6) / 2);
  }
}

// ============================================================
// СПУТНИК — Actor (был Item)
// ============================================================
export class CompanionActorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.HTMLField({ initial: "" }),
      species:     new fields.StringField({ initial: "" }),
      age:         new fields.NumberField({ initial: 0, min: 0, integer: true }),

      // Атрибуты
      attributes: new fields.SchemaField({
        agility:   new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        smarts:    new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        spirit:    new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        endurance: new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        magic:     new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
      }),

      bond:      new fields.NumberField({ initial: 1, min: 1, max: 5, integer: true }),
      character: new fields.StringField({ initial: "" }),
      owner:     new fields.StringField({ initial: "" }),
      condition: new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),

      // Кто владелец (UUID актора-персонажа или контейнера)
      owner_id: new fields.StringField({ initial: "" }),

      // Стан
      is_stunned: new fields.BooleanField({ initial: false }),

      // Статусы — embedded Items типа status (как у акторов)
      active_statuses: activeStatusesField(),
    };
  }
}

export class VehicleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:  new fields.HTMLField({ initial: "" }),
      vehicle_type: new fields.StringField({
        initial: "ground",
        choices: ["ground","air","water","magical","other"]
      }),
      speed:    new fields.NumberField({ initial: 60, integer: true }),
      toughness: new fields.NumberField({ initial: 8, integer: true }),
      capacity:  new fields.NumberField({ initial: 4, integer: true }),
      notes:     new fields.StringField({ initial: "" })
    };
  }
}


export class DeviceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:  new fields.HTMLField({ initial: "" }),

      device_type:  new fields.StringField({
        initial: "gadget",
        choices: ["gadget","weapon","drone","computer","medical","other"]
      }),

      creator:      new fields.StringField({ initial: "" }),

      condition:    new fields.StringField({
        initial: "good",
        choices: ["perfect","good","worn","broken"]
      }),

      // Бонус к навыку — drag-drop
      bonus_skill_uuid: new fields.StringField({ initial: "" }),
      bonus_skill_name: new fields.StringField({ initial: "" }),
      bonus_value:      new fields.NumberField({ initial: 0, integer: true }),

      charges:      new fields.NumberField({ initial: -1, integer: true }),
      equipped:     new fields.StringField({ initial: "home", choices: ["home","carried","equipped"] }),

      // Совместимость с мирами
      works_upper:  new fields.BooleanField({ initial: true }),
      works_lower:  new fields.BooleanField({ initial: true }),
      notes:        new fields.StringField({ initial: "" }),

      // ── Атакующие поля (только для device_type === "weapon") ──
      damage_level:     new fields.StringField({ initial: "light", choices: ["light","heavy","lethal"] }),
      damage_type:      new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
      range:            new fields.NumberField({ initial: 0, integer: true }),
      attack_skill_uuid: new fields.StringField({ initial: "" }),
      attack_skill_name: new fields.StringField({ initial: "" }),
      attack_modifier:  new fields.NumberField({ initial: 0, integer: true }),
      condition_chance: new fields.NumberField({ initial: 0, min: 0, max: 100, integer: true }),
      has_status:       new fields.BooleanField({ initial: false }),
      status_uuid:      new fields.StringField({ initial: "" }),
      status_name:      new fields.StringField({ initial: "" }),
    };
  }
}




export class ContactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.HTMLField({ initial: "" }),

      org_type: new fields.StringField({
        initial: "other",
        choices: ["academic","criminal","government","magical","corporate","underground","other"]
      }),

      access_level: new fields.StringField({
        initial: "open",
        choices: ["open","known","secret","forbidden"]
      }),

      leader:         new fields.StringField({ initial: "" }),
      goals:          new fields.StringField({ initial: "" }),
      representative: new fields.StringField({ initial: "" }),
      notes:          new fields.StringField({ initial: "" }),

      members: new fields.ArrayField(
        new fields.SchemaField({
          actor_uuid: new fields.StringField({ required: true, initial: "" }),
          actor_name: new fields.StringField({ initial: "" })
        })
      ),

      former_members: new fields.ArrayField(
        new fields.SchemaField({
          actor_uuid: new fields.StringField({ required: true, initial: "" }),
          actor_name: new fields.StringField({ initial: "" }),
          comment:    new fields.StringField({ initial: "" })
        })
      ),

      events: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true, initial: "" }),
          name: new fields.StringField({ initial: "" })
        })
      ),
    };
  }
}

export class LanguageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.StringField({ initial: "" }),
      world:       new fields.StringField({
        initial: "lower",
        choices: ["upper", "lower", "both", "mystic"]
      }),
      is_dead:     new fields.BooleanField({ initial: false }),
    };
  }
}


// ============================================================
// КОНТЕЙНЕР
// ============================================================
export class ContainerDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description:   new fields.StringField({ initial: "" }),
      money:         new fields.NumberField({ initial: 0, min: 0, integer: true }),
      // UUID-ссылки для уникальных объектов (как у персонажа)
      artifact_refs: new fields.ArrayField(new fields.StringField({ initial: "" })),
      daemon_refs:   new fields.ArrayField(new fields.StringField({ initial: "" })),
      companion_refs: new fields.ArrayField(new fields.StringField({ initial: "" })),
    };
  }
}

// ============================================================
// СТАТУС v2.0
// ============================================================
export class StatusDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;

    function skillTargetField() {
      return new fields.SchemaField({
        uuid: new fields.StringField({ initial: "" }),
        name: new fields.StringField({ initial: "" }),
      });
    }

    function rollModifierField() {
      return new fields.SchemaField({
        target_all:       new fields.BooleanField({ initial: false }),
        target_agility:   new fields.BooleanField({ initial: false }),
        target_smarts:    new fields.BooleanField({ initial: false }),
        target_spirit:    new fields.BooleanField({ initial: false }),
        target_endurance: new fields.BooleanField({ initial: false }),
        target_magic:     new fields.BooleanField({ initial: false }),
        target_toughness: new fields.BooleanField({ initial: false }),
        target_initiative:new fields.BooleanField({ initial: false }),
        target_weapon:    new fields.BooleanField({ initial: false }),
        target_spell:     new fields.BooleanField({ initial: false }),
        target_device:    new fields.BooleanField({ initial: false }),
        target_gear:      new fields.BooleanField({ initial: false }),
        target_artifact:  new fields.BooleanField({ initial: false }),
        target_all_items: new fields.BooleanField({ initial: false }),
        target_skills:    new fields.ArrayField(skillTargetField()),
        die_change:         new fields.NumberField({ initial: 0, integer: true }),
        extra_die_enabled:  new fields.BooleanField({ initial: false }),
        extra_die_faces:    new fields.NumberField({ initial: 6, integer: true }),
        extra_die_mode:     new fields.StringField({ initial: "add", choices: ["add","subtract"] }),
        modifier:           new fields.NumberField({ initial: 0, integer: true }),
        success_modifier:   new fields.NumberField({ initial: 0, integer: true }),
      });
    }

    function healthEffectField() {
      return new fields.SchemaField({
        track:    new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
        mode:     new fields.StringField({ initial: "damage",   choices: ["damage","heal"] }),
        amount:   new fields.NumberField({ initial: 1, integer: true, min: 0 }),
        overflow: new fields.BooleanField({ initial: false }),
      });
    }

    function energyEffectField() {
      return new fields.SchemaField({
        mode:          new fields.StringField({ initial: "current", choices: ["current","max","restore","roll_mod"] }),
        amount:        new fields.NumberField({ initial: 0, integer: true }),
        roll_modifier: new fields.NumberField({ initial: 0, integer: true }),
      });
    }

    function effectEntryField() {
      return new fields.SchemaField({
        id:            new fields.StringField({ initial: "" }),
        enabled:       new fields.BooleanField({ initial: true }),
        type:          new fields.StringField({ initial: "roll_modifier", choices: ["roll_modifier","health","energy"] }),
        roll_modifier: rollModifierField(),
        health:        healthEffectField(),
        energy:        energyEffectField(),
      });
    }

    return {
      description:         new fields.HTMLField({ initial: "" }),
      removal_instruction: new fields.StringField({ initial: "" }),
      // Типы-теги: poison, bleed, acid, burn, cold, electric,
      // infection, disease, shock_mental, fear, madness, blindness,
      // magic_effect, curse, debt_fate, debt
      status_types: new fields.ArrayField(new fields.StringField({ initial: "" })),
      apply_stun:   new fields.BooleanField({ initial: false }),
      duration: new fields.SchemaField({
        mode:        new fields.StringField({ initial: "time", choices: ["time","charges","counter"] }),
        value:       new fields.NumberField({ initial: 1, integer: true, min: 0 }),
        auto_reduce: new fields.BooleanField({ initial: true }),
      }),
      effects: new fields.ArrayField(effectEntryField()),
    };
  }
}
