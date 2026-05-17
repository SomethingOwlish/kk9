// ============================================================
// КК9 — Дата-модели v0.5
// ============================================================

const { fields } = foundry.data;

function attributeField() {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
  });
}

function skillField(linkedAttribute = "agility") {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    linkedAttribute: new fields.StringField({ required: true, initial: linkedAttribute }),
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
  });
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
      // Теперь хранит id faculty item (или null)
      faculty:        new fields.StringField({ initial: null, nullable: true, blank: false }),
      // Кэш цвета и ключа для оформления (обновляется при смене факультета)
      faculty_color:  new fields.StringField({ initial: "" }),
      faculty_key:    new fields.StringField({ initial: "" }),

      // --- Атрибуты ---
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        magic:    attributeField(),
      }),

      // Навыки теперь Items типа skill — хардкожен только пустой объект для совместимости
      skills: new fields.SchemaField({}),

      // Индивидуальные навыки
      customSkills: new fields.ArrayField(
        new fields.SchemaField({
          name:            new fields.StringField({ required: true, initial: "" }),
          die:             new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier:        new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      // Языки (id items из компендиума/инвентаря)
      languages: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          itemId: new fields.StringField({ initial: "" })
        })
      ),

      // Уровни магических способностей (только для magic category)
      // хранится на персонаже: [{itemId, level: "sparks"|"normal"|"exceptional"}]
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
    // Стойкость = 2 + половина кубика Духа
    this.health.physical.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
    // Энергия max = возраст + кубик Магии
    this.energy.max = this.age + this.attributes.magic.die;
  }
}

export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      role:  new fields.StringField({ initial: "" }),
      die:   new fields.NumberField({ required: true, initial: 6, choices: [4,6,8,10,12] }),
      health: new fields.SchemaField({
        value:     new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
        toughness: new fields.NumberField({ required: true, initial: 5, integer: true })
      }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

export class NpcHardDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      biography: new fields.HTMLField({ initial: "" }),
      role:      new fields.StringField({ initial: "" }),
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        magic:    attributeField(),
      }),
      skills: new fields.SchemaField({
        athletics: skillField("agility"),
        notice:    skillField("smarts"),
        fighting:  skillField("agility"),
        magic:     skillField("magic"),
      }),
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value:     new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        mental: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0, min: 0, max: 5, integer: true })
        })
      }),
      relations: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ initial: "" }),
          status: new fields.StringField({ initial: "neutral" }),
          level:  new fields.NumberField({ initial: 0, min: -15, max: 15, integer: true }),
          notes:  new fields.StringField({ initial: "" }),
          love:   new fields.BooleanField({ initial: false })
        })
      ),
      notes: new fields.StringField({ initial: "" })
    };
  }
  prepareDerivedData() {
    this.health.physical.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
  }
}

export class NpcBossDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:       new fields.HTMLField({ initial: "" }),
      threat_level:      new fields.StringField({ initial: "высокая" }),
      special_mechanics: new fields.StringField({ initial: "" }),
      notes:             new fields.StringField({ initial: "" })
    };
  }
}

// ============================================================
// ПРЕДМЕТЫ
// ============================================================

/**
 * Факультет — содержит цвет, учителя и список способностей
 * Способности добавляются перетаскиванием ability items
 */
export class FacultyDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Свободный hex цвет — можно любой, хоть #ff69b4
      color:       new fields.StringField({ initial: "#888888" }),
      // Ключ для CSS класса (вычисляется автоматически или задаётся)
      color_key:   new fields.StringField({ initial: "" }),
      teacher:     new fields.StringField({ initial: "" }),
      // Способности факультета — ability items перетащенные сюда
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

/**
 * Навык — Item типа skill
 * linkedAttribute: agility | smarts | spirit | strength | magic
 * die не может превышать кубик linkedAttribute на персонаже
 */
export class SkillDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:     new fields.StringField({ initial: "" }),
      linkedAttribute: new fields.StringField({
        required: true, initial: "smarts",
        choices: ["agility","smarts","spirit","strength","magic"]
      }),
      // "Неумелый" = d4 с modifier -2
      die:      new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
      modifier: new fields.NumberField({ initial: -2, integer: true }),
      // Базовый навык (из компендиума) или индивидуальный
      isBase: new fields.BooleanField({ initial: false })
    };
  }
}

/**
 * Способность
 * category: common | personal | learned | magic
 * faculty_id: id faculty item (null если личная)
 */
export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      category: new fields.StringField({
        initial: "personal",
        choices: ["common", "personal", "learned", "magic"]
      }),
      // К какому факультету относится (null = личная)
      faculty_id: new fields.StringField({ initial: null, nullable: true, blank: false }),
      // Кубик для броска (как навык)
      // "Неумелый" = d4 с modifier -2
      die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
      modifier: new fields.NumberField({ initial: -2, integer: true })
    };
  }
}

/**
 * Оружие
 */
export class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      damage:      new fields.StringField({ initial: "" }),       // "Str+d6", "2d8"
      range:       new fields.StringField({ initial: "" }),       // "Ближний", "12/24/48"
      ap:          new fields.NumberField({ initial: 0, integer: true }), // Бронепробивание
      rof:         new fields.NumberField({ initial: 1, integer: true }), // Скорострельность
      weight:      new fields.NumberField({ initial: 0 }),
      equipped:    new fields.BooleanField({ initial: false }),
      notes:       new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Снаряжение — обычные немагические предметы
 */
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

/**
 * Артефакт — магический предмет с бонусами
 */
export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      rarity: new fields.StringField({
        initial: "common",
        choices: ["common", "uncommon", "rare", "unique"]
      }),
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

/**
 * Заклинание
 */
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

/**
 * Даймон — призывное существо (важно: не демон, а даймон)
 */
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

/**
 * Спутник — существо/питомец
 */
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

/**
 * Транспорт
 */
export class VehicleDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      vehicle_type: new fields.StringField({
        initial: "ground",
        choices: ["ground", "air", "water", "space", "magical", "other"]
      }),
      speed:     new fields.NumberField({ initial: 60, integer: true }),
      toughness: new fields.NumberField({ initial: 8, integer: true }),
      capacity:  new fields.NumberField({ initial: 4, integer: true }),
      notes:     new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Техническое устройство
 */
export class DeviceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      device_type: new fields.StringField({
        initial: "gadget",
        choices: ["gadget", "weapon", "drone", "computer", "medical", "other"]
      }),
      // Бонус который даёт устройство
      bonus_skill:  new fields.StringField({ initial: "" }),
      bonus_value:  new fields.NumberField({ initial: 0, integer: true }),
      charges:      new fields.NumberField({ initial: -1, integer: true }), // -1 = неограничено
      equipped:     new fields.BooleanField({ initial: false }),
      notes:        new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Контакт — организация или структура
 */
export class ContactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      org_type: new fields.StringField({
        initial: "other",
        choices: ["academic", "criminal", "government", "magical", "corporate", "underground", "other"]
      }),
      // Уровень доступа который даёт контакт (1-5)
      access_level: new fields.NumberField({ initial: 1, min: 1, max: 5, integer: true }),
      // Куратор/представитель в организации
      representative: new fields.StringField({ initial: "" }),
      notes:          new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Язык
 */
export class LanguageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ initial: "" }),
      region:      new fields.StringField({ initial: "" })
    };
  }
}
