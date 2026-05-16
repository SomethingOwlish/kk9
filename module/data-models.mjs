// ============================================================
// КК9 — Дата-модели
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
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
    label: new fields.StringField({ initial: "" })
  });
}

export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      biography: new fields.HTMLField({ initial: "" }),
      age: new fields.NumberField({ required: true, initial: 18, min: 0, integer: true }),
      academy_year: new fields.StringField({ initial: "1" }),
      faculty: new fields.StringField({
        initial: null,
        nullable: true,
        blank: false,
        choices: ["white", "black", "blue", "green", "purple", "red", "brown", "mercury", "invisible"]
      }),

      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        vigor:    attributeField(),
      }),

      skills: new fields.SchemaField({
        athletics:     skillField("agility"),
        notice:        skillField("smarts"),
        stealth:       skillField("agility"),
        persuasion:    skillField("spirit"),
        fighting:      skillField("agility"),
        shooting:      skillField("agility"),
        magic:         skillField("smarts"),
        occult:        skillField("smarts"),
        investigation: skillField("smarts"),
        intimidation:  skillField("spirit"),
        survival:      skillField("smarts"),
        driving:       skillField("agility"),
        hacking:       skillField("smarts"),
        ritual:        skillField("spirit"),
      }),

      // Скиллы факультета хранятся отдельно от кастомных
      facultySkills: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: "" }),
          die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      customSkills: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: "" }),
          die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        will: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 10, integer: true }),
          max: new fields.NumberField({ required: true, initial: 10, integer: true })
        })
      }),

      bennies: new fields.NumberField({ required: true, initial: 3, min: 0, integer: true }),
      pace: new fields.NumberField({ required: true, initial: 6, integer: true }),
      parry: new fields.NumberField({ required: true, initial: 2, integer: true }),
      notes: new fields.StringField({ initial: "" }),

      relations: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: "" }),
          status: new fields.StringField({ initial: "neutral", choices: ["ally", "enemy", "neutral", "unknown"] }),
          level: new fields.NumberField({ initial: 0, min: -5, max: 5, integer: true }),
          notes: new fields.StringField({ initial: "" })
        })
      )
    };
  }

  prepareDerivedData() {
    const vigorDie = this.attributes.vigor.die;
    this.health.physical.toughness = 2 + Math.floor(vigorDie / 2);
    const agilityDie = this.attributes.agility.die;
    this.parry = 2 + Math.floor(agilityDie / 2);
  }
}

export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      role: new fields.StringField({ initial: "Прохожий" }),
      die: new fields.NumberField({ required: true, initial: 6, choices: [4, 6, 8, 10, 12] }),
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
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
      role: new fields.StringField({ initial: "" }),
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        vigor:    attributeField(),
      }),
      skills: new fields.SchemaField({
        athletics:  skillField("agility"),
        notice:     skillField("smarts"),
        fighting:   skillField("agility"),
        shooting:   skillField("agility"),
        magic:      skillField("smarts"),
      }),
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        will: new fields.SchemaField({
          value: new fields.NumberField({ initial: 0, min: 0, max: 10, integer: true }),
          max: new fields.NumberField({ initial: 10, integer: true })
        })
      }),
      relations: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ initial: "" }),
          status: new fields.StringField({ initial: "neutral" }),
          level: new fields.NumberField({ initial: 0, min: -5, max: 5, integer: true }),
          notes: new fields.StringField({ initial: "" })
        })
      ),
      notes: new fields.StringField({ initial: "" })
    };
  }

  prepareDerivedData() {
    const vigorDie = this.attributes.vigor.die;
    this.health.physical.toughness = 2 + Math.floor(vigorDie / 2);
  }
}

export class NpcBossDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      threat_level: new fields.StringField({ initial: "высокая" }),
      special_mechanics: new fields.StringField({ initial: "" }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      rarity: new fields.StringField({ initial: "common", choices: ["common", "uncommon", "rare", "unique"] }),
      bonuses: new fields.SchemaField({
        agility:   new fields.NumberField({ initial: 0, integer: true }),
        smarts:    new fields.NumberField({ initial: 0, integer: true }),
        spirit:    new fields.NumberField({ initial: 0, integer: true }),
        strength:  new fields.NumberField({ initial: 0, integer: true }),
        vigor:     new fields.NumberField({ initial: 0, integer: true }),
        parry:     new fields.NumberField({ initial: 0, integer: true }),
        toughness: new fields.NumberField({ initial: 0, integer: true })
      }),
      active: new fields.BooleanField({ initial: false }),
      damage: new fields.StringField({ initial: "" }),
      equipped: new fields.BooleanField({ initial: false })
    };
  }
}

export class SpellDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      cost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      range: new fields.StringField({ initial: "смотри описание" }),
      damage: new fields.StringField({ initial: "" }),
      duration: new fields.StringField({ initial: "мгновенное" }),
      school: new fields.StringField({ initial: "" }),
      roll_skill: new fields.StringField({ initial: "magic" })
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
        vigor:    attributeField(),
      }),
      health: new fields.SchemaField({
        value: new fields.NumberField({ initial: 0, min: 0, max: 5, integer: true }),
        toughness: new fields.NumberField({ initial: 5, integer: true })
      }),
      abilities: new fields.StringField({ initial: "" }),
      summon_condition: new fields.StringField({ initial: "" }),
      summon_cost: new fields.StringField({ initial: "" }),
      summoned: new fields.BooleanField({ initial: false })
    };
  }
}

export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      type: new fields.StringField({ initial: "passive", choices: ["passive", "active"] }),
      activation: new fields.StringField({ initial: "" })
    };
  }
}

export class CompanionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      companion_type: new fields.StringField({ initial: "pet", choices: ["pet", "vehicle", "device", "other"] }),
      speed: new fields.NumberField({ initial: 6, integer: true }),
      toughness: new fields.NumberField({ initial: 5, integer: true }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}
