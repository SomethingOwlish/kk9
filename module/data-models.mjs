// ============================================================
// КК9 — Дата-модели v0.8
// ============================================================

const { fields } = foundry.data;

function attributeField() {
  return new fields.SchemaField({
    die:      new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
  });
}

function skillField(linkedAttribute = "agility") {
  return new fields.SchemaField({
    die:             new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    linkedAttribute: new fields.StringField({ required: true, initial: linkedAttribute }),
    modifier:        new fields.NumberField({ required: true, initial: 0, integer: true })
  });
}

// НПС атрибут — расширен до d100
function npcAttributeField() {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial: 6, choices: [4, 6, 8, 10, 12, 20, 100], integer: true })
  });
}

// Общие поля для всех НПС
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
    initiative: new fields.NumberField({ initial: 0, integer: true }),
    toughness:  new fields.NumberField({ initial: 5, integer: true }),
    energy: new fields.SchemaField({
      value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      max:   new fields.NumberField({ required: true, initial: 10, integer: true })
    }),
  };
}

// ============================================================
// АКТЁРЫ
// ============================================================

export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Биография ---
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

      // --- Факультет ---
      faculty:        new fields.StringField({ initial: null, nullable: true, blank: false }),
      faculty_color:  new fields.StringField({ initial: "" }),
      faculty_key:    new fields.StringField({ initial: "" }),
      faculty_name:   new fields.StringField({ initial: "" }),

      // --- Атрибуты ---
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

      // --- Здоровье ---
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

      // --- Энергия ---
      energy: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ required: true, initial: 22, integer: true })
      }),

      // --- Прочее ---
      bennies:    new fields.NumberField({ required: true, initial: 3, min: 0, max: 9, integer: true }),
      money:      new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      experience: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

      // --- Связи ---
      relations: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          status: new fields.StringField({ initial: "neutral", choices: ["ally","enemy","neutral","unknown"] }),
          level:  new fields.NumberField({ initial: 0, min: -15, max: 15, integer: true }),
          notes:  new fields.StringField({ initial: "" }),
          love:   new fields.BooleanField({ initial: false })
        })
      )
    };
  }

  prepareDerivedData() {
    this.health.physical.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    this.energy.max = this.age + this.attributes.magic.die;
  }
}

// ============================================================
// ЛЁГКИЙ НПС — 2 ячейки + KO на каждой шкале. Только свои кубики.
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
    // Стойкость = 2 + половина кубика Духа (как у игрока)
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    // Энергия max = max значение кубика Духа (аналог возраст + кубик магии у игрока)
    this.energy.max = this.attributes.spirit.die;
  }
}

// ============================================================
// СЛОЖНЫЙ НПС — 5 ячеек на каждой шкале как у игрока. Только свои кубики.
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
    this.energy.max = this.attributes.spirit.die;
  }
}

// ============================================================
// НЕПОБЕДИМЫЙ НПС — нет шкал здоровья. Бросает д6 + свой атрибут.
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
    this.energy.max = this.attributes.spirit.die;
  }
}

// ============================================================
// ПРЕДМЕТЫ
// ============================================================

export class FacultyDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      color:       new fields.StringField({ initial: "#888888" }),
      color_key:   new fields.StringField({ initial: "" }),
      teacher:     new fields.StringField({ initial: "" }),
      abilities: new fields.ArrayField(
        new fields.SchemaField({
          name:     new fields.StringField({ required: true, initial: "" }),
          itemId:   new fields.StringField({ initial: "" }),
          category: new fields.StringField({ initial: "common", choices: ["common","personal","learned","magic"] })
        })
      )
    };
  }
}

export class SkillDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:     new fields.StringField({ initial: "" }),
      linkedAttribute: new fields.StringField({
        required: true, initial: "smarts",
        choices: ["agility","smarts","spirit","strength","magic"]
      }),
      die:      new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
      modifier: new fields.NumberField({ initial: -2, integer: true }),
      isBase:   new fields.BooleanField({ initial: false })
    };
  }
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      category: new fields.StringField({
        initial: "personal",
        choices: ["common", "personal", "learned", "magic"]
      }),
      faculty_id: new fields.StringField({ initial: null, nullable: true, blank: false }),
      die:        new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
      modifier:   new fields.NumberField({ initial: -2, integer: true })
    };
  }
}

export class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      damage:      new fields.StringField({ initial: "" }),
      range:       new fields.StringField({ initial: "" }),
      ap:          new fields.NumberField({ initial: 0, integer: true }),
      rof:         new fields.NumberField({ initial: 1, integer: true }),
      weight:      new fields.NumberField({ initial: 0 }),
      equipped:    new fields.BooleanField({ initial: false }),
      notes:       new fields.StringField({ initial: "" })
    };
  }
}

export class GearDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      quantity:    new fields.NumberField({ initial: 1, min: 0, integer: true }),
      weight:      new fields.NumberField({ initial: 0 }),
      equipped:    new fields.BooleanField({ initial: false }),
      notes:       new fields.StringField({ initial: "" })
    };
  }
}

export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      rarity: new fields.StringField({ initial: "common", choices: ["common","uncommon","rare","unique"] }),
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        strength:  new fields.NumberField({ initial: 0, integer: true }),
        magic:     new fields.NumberField({ initial: 0, integer: true }),
        toughness: new fields.NumberField({ initial: 0, integer: true })
      }),
      damage:   new fields.StringField({ initial: "" }),
      equipped: new fields.BooleanField({ initial: false }),
      active:   new fields.BooleanField({ initial: false })
    };
  }
}

export class SpellDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      cost:        new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      range:       new fields.StringField({ initial: "" }),
      damage:      new fields.StringField({ initial: "" }),
      duration:    new fields.StringField({ initial: "мгновенное" }),
      school:      new fields.StringField({ initial: "" }),
      roll_skill:  new fields.StringField({ initial: "magic" })
    };
  }
}

export class DaemonDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        magic:    attributeField(),
      }),
      health: new fields.SchemaField({
        value:     new fields.NumberField({ initial: 0, min: 0, max: 5, integer: true }),
        toughness: new fields.NumberField({ initial: 5, integer: true })
      }),
      abilities:        new fields.StringField({ initial: "" }),
      summon_condition: new fields.StringField({ initial: "" }),
      summon_cost:      new fields.StringField({ initial: "" }),
      summoned:         new fields.BooleanField({ initial: false })
    };
  }
}

export class CompanionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      species:     new fields.StringField({ initial: "" }),
      speed:       new fields.NumberField({ initial: 6, integer: true }),
      toughness:   new fields.NumberField({ initial: 5, integer: true }),
      notes:       new fields.StringField({ initial: "" })
    };
  }
}

export class VehicleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      vehicle_type: new fields.StringField({
        initial: "ground",
        choices: ["ground","air","water","space","magical","other"]
      }),
      speed:     new fields.NumberField({ initial: 60, integer: true }),
      toughness: new fields.NumberField({ initial: 8, integer: true }),
      capacity:  new fields.NumberField({ initial: 4, integer: true }),
      notes:     new fields.StringField({ initial: "" })
    };
  }
}

export class DeviceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      device_type: new fields.StringField({
        initial: "gadget",
        choices: ["gadget","weapon","drone","computer","medical","other"]
      }),
      bonus_skill:  new fields.StringField({ initial: "" }),
      bonus_value:  new fields.NumberField({ initial: 0, integer: true }),
      charges:      new fields.NumberField({ initial: -1, integer: true }),
      equipped:     new fields.BooleanField({ initial: false }),
      notes:        new fields.StringField({ initial: "" })
    };
  }
}

export class ContactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      org_type: new fields.StringField({
        initial: "other",
        choices: ["academic","criminal","government","magical","corporate","underground","other"]
      }),
      access_level:   new fields.NumberField({ initial: 1, min: 1, max: 5, integer: true }),
      representative: new fields.StringField({ initial: "" }),
      notes:          new fields.StringField({ initial: "" })
    };
  }
}

export class LanguageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ initial: "" }),
      region:      new fields.StringField({ initial: "" })
    };
  }
}
