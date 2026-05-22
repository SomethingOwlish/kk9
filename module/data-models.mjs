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
  return new fields.ArrayField(
    new fields.SchemaField({
      uuid:        new fields.StringField({ required: true, initial: "" }),
      statusName:  new fields.StringField({ initial: "" }),
      status_type: new fields.StringField({ initial: "shock" }),
      damage:      new fields.StringField({ initial: "none" }),
      damage_type: new fields.StringField({ initial: "physical" }),
      frequency:   new fields.StringField({ initial: "per_turn" }),
      uses:        new fields.NumberField({ initial: -1, integer: true })
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
      strength: npcAttributeField(),
      magic:    npcAttributeField(),
    }),
    toughness: new fields.NumberField({ initial: 5, integer: true }),
    energy: new fields.SchemaField({
      value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ required: true, initial: 10, integer: true })
    }),
    active_statuses: activeStatusesField(),
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
        strength: attributeField(),
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

      // Ссылки на связанные документы (UUID — не embedded copies)
      artifact_refs:  new fields.ArrayField(new fields.StringField({ initial: "" })),
      daemon_refs:    new fields.ArrayField(new fields.StringField({ initial: "" })),
      companion_refs: new fields.ArrayField(new fields.StringField({ initial: "" })),
      contact_refs:   new fields.ArrayField(new fields.StringField({ initial: "" })),
    };
  }

  prepareDerivedData() {
    this.health.physical.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    this.energy.max = this.age + this.attributes.magic.die;
  }
}

// ============================================================
// НПС ЛЁГКИЙ — 2 ячейки + Отключка
// ============================================================
export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ...npcCommonFields(),
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value:    new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
          knockout: new fields.BooleanField({ initial: false })
        }),
        mental: new fields.SchemaField({
          value:    new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
          knockout: new fields.BooleanField({ initial: false })
        })
      }),
    };
  }
  prepareDerivedData() {
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    const ageNum = parseInt(this.age) || 0;
    this.energy.max = ageNum + this.attributes.spirit.die;
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
    };
  }
  prepareDerivedData() {
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    const ageNum = parseInt(this.age) || 0;
    this.energy.max = ageNum + this.attributes.spirit.die;
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
      linkedAttribute: new fields.StringField({ initial: "smarts", choices: ["agility","smarts","spirit","strength","magic"] }),
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
      equipped:     new fields.BooleanField({ initial: false }),
      condition:    new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),
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
      equipped:    new fields.BooleanField({ initial: false }),
      // Восстановление энергии (для зелий и утилит)
      energy_restore: new fields.NumberField({ initial: 0, min: 0, integer: true }),
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
        choices: ["attack","defense","binding","spatial","utility","buff","transforming","prophetic","wand"]
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

      // Размер
      size: new fields.StringField({
        initial: "small",
        choices: ["pocket","finger","small","medium","large","huge","immovable"]
      }),

      // Состояние
      equipped:   new fields.BooleanField({ initial: false }),
      condition:  new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] }),
      active:     new fields.BooleanField({ initial: false }),
      destroyed:  new fields.BooleanField({ initial: false }),

      // Бонусы к атрибутам (если бафф/экипирован+активен)
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        strength:  new fields.NumberField({ initial: 0, integer: true }),
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
      skill_uuid:  new fields.StringField({ initial: "" }),
      skill_name:  new fields.StringField({ initial: "" }),

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

      // Навык-тип магии — drag-drop магического навыка/способности
      skill_uuid: new fields.StringField({ initial: "" }),
      skill_name: new fields.StringField({ initial: "" }),

      // ── АТАКУЮЩИЕ ПОЛЯ (spell_type === "attack") ──
      damage_level: new fields.StringField({
        initial: "light",
        choices: ["light","heavy","lethal"]
      }),
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
        strength:  new fields.NumberField({ initial: 0, integer: true }),
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

export class DaemonDataModel extends foundry.abstract.TypeDataModel {
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

      // Класс — зависит от корпорации
      // Таро: "1"-"10", "page", "queen", "knight", "king", "major"
      // Радуга: "junior", "middle", "senior", "elder", "great"
      daemon_class: new fields.StringField({ initial: "1" }),

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

      // Внешний вид
      appearance: new fields.StringField({ initial: "" }),

      // Психологические поля
      dream:   new fields.StringField({ initial: "" }),
      fear:    new fields.StringField({ initial: "" }),
      desire:  new fields.StringField({ initial: "" }),

      // ── РЕЖИМ ШАРИК ──
      captor:  new fields.StringField({ initial: "" }),   // пленитель
      used:    new fields.BooleanField({ initial: false }),// использован

      // ── РЕЖИМ СВОБОДНЫЙ ──
      gone:    new fields.BooleanField({ initial: false }), // ушёл

      // Здоровье (5+5 пипов как у сложного НПС)
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        })
      }),

      // Атрибуты даймона
      attributes: new fields.SchemaField({
        agility:  new fields.SchemaField({
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        }),
        smarts:   new fields.SchemaField({
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        }),
        spirit:   new fields.SchemaField({
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        }),
        strength: new fields.SchemaField({
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        }),
        magic:    new fields.SchemaField({
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        }),
      }),

      // Навыки и способности (хранятся внутри item как массив)
      skills: new fields.ArrayField(
        new fields.SchemaField({
          uuid:     new fields.StringField({ initial: "" }),
          name:     new fields.StringField({ initial: "" }),
          type:     new fields.StringField({ initial: "skill" }),
          die:      new fields.NumberField({ initial: 6, integer: true }),
          modifier: new fields.NumberField({ initial: 0, integer: true }),
        })
      ),
      condition: new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] })
    };
  }
}

export class CompanionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { fields } = foundry.data;
    return {
      description: new fields.HTMLField({ initial: "" }),
      species:     new fields.StringField({ initial: "" }),
      age:         new fields.NumberField({ initial: 0, min: 0, integer: true }),
      // Атрибуты спутника
      attributes: new fields.SchemaField({
        agility:  new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        smarts:   new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        spirit:   new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        strength: new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
        magic:    new fields.SchemaField({ die: new fields.NumberField({ initial: 6, integer: true }), modifier: new fields.NumberField({ initial: 0, integer: true }) }),
      }),
      bond:        new fields.NumberField({ initial: 1, min: 1, max: 5, integer: true }),
      character:   new fields.StringField({ initial: "" }),
      owner:       new fields.StringField({ initial: "" }),
      condition:   new fields.StringField({ initial: "good", choices: ["broken","worn","good","perfect"] })
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
        choices: ["gadget","drone","computer","medical","other"]
      }),

      creator:      new fields.StringField({ initial: "" }),

      condition:    new fields.StringField({
        initial: "perfect",
        choices: ["perfect","good","worn","broken"]
      }),

      // Бонус к навыку — drag-drop
      bonus_skill_uuid: new fields.StringField({ initial: "" }),
      bonus_skill_name: new fields.StringField({ initial: "" }),
      bonus_value:      new fields.NumberField({ initial: 0, integer: true }),

      charges:      new fields.NumberField({ initial: -1, integer: true }),
      equipped:     new fields.BooleanField({ initial: false }),

      // Совместимость с мирами
      works_upper:  new fields.BooleanField({ initial: true }),
      works_lower:  new fields.BooleanField({ initial: true }),
      notes:        new fields.StringField({ initial: "" })
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
// СТАТУС (новый тип v0.9.0)
// ============================================================
export class StatusDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:  new fields.HTMLField({ initial: "" }),
      status_type:  new fields.StringField({ initial: "shock", choices: ["poison","shock","magic","bleed","acid"] }),
      effect:       new fields.StringField({ initial: "" }),
      damage:       new fields.StringField({ initial: "none", choices: ["none","light","heavy","lethal"] }),
      damage_type:  new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
      frequency:    new fields.StringField({ initial: "per_turn", choices: ["per_turn","per_combat","per_hour","per_day","rare"] }),
      uses:         new fields.NumberField({ initial: -1, integer: true })
    };
  }
}
