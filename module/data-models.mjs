// ============================================================
// КК9 — Дата-модели v0.4
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

export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Биография / личное ---
      biography:    new fields.HTMLField({ initial: "" }),
      age:          new fields.NumberField({ required: true, initial: 18, min: 0, integer: true }),
      academy_year: new fields.StringField({ initial: "1" }),
      birthplace:   new fields.StringField({ initial: "" }),   // страна рождения
      dormitory:    new fields.StringField({ initial: "" }),   // общежитие
      gender:       new fields.StringField({ initial: "" }),
      height:       new fields.StringField({ initial: "" }),
      build:        new fields.StringField({ initial: "" }),   // сложение
      allergies:    new fields.StringField({ initial: "" }),
      weaknesses:   new fields.StringField({ initial: "" }),   // слабости (большое поле)
      notes:        new fields.StringField({ initial: "" }),   // заметки (перенесены в биографию)
      gm_notes:     new fields.StringField({ initial: "" }),   // мастерские заметки (только GM)

      // --- Факультет ---
      faculty: new fields.StringField({
        initial: null,
        nullable: true,
        blank: false,
        choices: ["white","black","blue","green","purple","red","brown","mercury","invisible"]
      }),

      // --- Атрибуты (Живучесть → Магия) ---
      attributes: new fields.SchemaField({
        agility:  attributeField(),   // Ловкость
        smarts:   attributeField(),   // Смекалка
        spirit:   attributeField(),   // Дух
        strength: attributeField(),   // Сила
        magic:    attributeField(),   // Магия (была Живучесть)
      }),

      // --- Навыки ---
      skills: new fields.SchemaField({
        athletics:     skillField("agility"),
        notice:        skillField("smarts"),
        stealth:       skillField("agility"),
        persuasion:    skillField("spirit"),
        fighting:      skillField("agility"),
        deception:     skillField("smarts"),    // Обман (новый)
        navigation:    skillField("smarts"),    // Ориентирование (новый)
        memory:        skillField("smarts"),    // Память (новый)
        knowledge:     skillField("smarts"),    // Знания (новый)
        intimidation:  skillField("spirit"),
        survival:      skillField("smarts"),
        driving:       skillField("agility"),
      }),

      // Скиллы факультета
      facultySkills: new fields.ArrayField(
        new fields.SchemaField({
          name:            new fields.StringField({ required: true, initial: "" }),
          die:             new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier:        new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      // Индивидуальные навыки
      customSkills: new fields.ArrayField(
        new fields.SchemaField({
          name:            new fields.StringField({ required: true, initial: "" }),
          die:             new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier:        new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      // Магические таланты (перетаскиваются из Items со статусом)
      magicTalents: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          itemId: new fields.StringField({ initial: "" }),
          level:  new fields.StringField({
            initial: "weak",
            choices: ["weak", "strong", "exceptional"]
          })
        })
      ),

      // Языки (перетаскиваются из Items типа "language")
      languages: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          itemId: new fields.StringField({ initial: "" })
        })
      ),

      // --- Здоровье ---
      health: new fields.SchemaField({
        // Физическое (5 степеней)
        physical: new fields.SchemaField({
          value:     new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        // Ментальное (5 степеней, пока та же шкала)
        mental: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true })
        }),
        // Воля — заготовка
        will: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 10, integer: true }),
          max:   new fields.NumberField({ required: true, initial: 10, integer: true })
        })
      }),

      // --- Энергия: max = age + magic.die ---
      energy: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        max:   new fields.NumberField({ required: true, initial: 22, integer: true })
      }),

      // --- Прочие числа ---
      bennies:    new fields.NumberField({ required: true, initial: 3, min: 0, max: 9, integer: true }),
      money:      new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      experience: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

      // Инициатива — не хранится, считается при броске (agility + smarts)
      // Стойкость — бросок духа + выбранный скилл (не хранится)

      // --- Связи ---
      relations: new fields.ArrayField(
        new fields.SchemaField({
          name:   new fields.StringField({ required: true, initial: "" }),
          status: new fields.StringField({ initial: "neutral", choices: ["ally","enemy","neutral","unknown"] }),
          level:  new fields.NumberField({ initial: 0, min: -5, max: 5, integer: true }),
          notes:  new fields.StringField({ initial: "" })
        })
      )
    };
  }

  prepareDerivedData() {
    // Стойкость = 2 + половина кубика Духа
    const spiritDie = this.attributes.spirit.die;
    this.health.physical.toughness = 2 + Math.floor(spiritDie / 2);

    // Энергия max = возраст + значение кубика Магии
    const magicDie = this.attributes.magic.die;
    this.energy.max = this.age + magicDie;
  }
}

export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      role:  new fields.StringField({ initial: "Прохожий" }),
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
          level:  new fields.NumberField({ initial: 0, min: -5, max: 5, integer: true }),
          notes:  new fields.StringField({ initial: "" })
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

export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      rarity:      new fields.StringField({ initial: "common", choices: ["common","uncommon","rare","unique"] }),
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        strength:  new fields.NumberField({ initial: 0, integer: true }),
        magic:     new fields.NumberField({ initial: 0, integer: true }),
        toughness: new fields.NumberField({ initial: 0, integer: true })
      }),
      active:   new fields.BooleanField({ initial: false }),
      damage:   new fields.StringField({ initial: "" }),
      equipped: new fields.BooleanField({ initial: false })
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
      roll_skill:  new fields.StringField({ initial: "magic" }),
      // Пометка "магический" для магических талантов
      is_magic:    new fields.BooleanField({ initial: true })
    };
  }
}

export class DemonDataModel extends foundry.abstract.TypeDataModel {
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

export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      type:        new fields.StringField({ initial: "passive", choices: ["passive","active"] }),
      activation:  new fields.StringField({ initial: "" }),
      // Категория: обычная или магическая
      category:    new fields.StringField({ initial: "normal", choices: ["normal","magic"] })
    };
  }
}

export class CompanionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:    new fields.HTMLField({ initial: "" }),
      companion_type: new fields.StringField({ initial: "pet", choices: ["pet","vehicle","device","other"] }),
      speed:          new fields.NumberField({ initial: 6, integer: true }),
      toughness:      new fields.NumberField({ initial: 5, integer: true }),
      notes:          new fields.StringField({ initial: "" })
    };
  }
}

// Новый тип: Язык (для мультивыбора на карточке)
export class LanguageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ initial: "" }),
      region:      new fields.StringField({ initial: "" }) // регион/происхождение языка
    };
  }
}
