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

export class SkillDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:     new fields.StringField({ initial: "" }),
      linkedAttribute: new fields.StringField({ required: true, initial: "smarts", choices: ["agility","smarts","spirit","strength","magic"] }),
      die:      new fields.NumberField({ required: true, initial: 4, choices: [4,6,8,10,12,20] }),
      modifier: new fields.NumberField({ initial: -2, integer: true }),
      isBase:   new fields.BooleanField({ initial: false })
    };
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
      modifier:        new fields.NumberField({ initial: -2, integer: true })
    };
  }
}

export class WeaponDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:  new fields.HTMLField({ initial: "" }),
      skill_uuid:   new fields.StringField({ initial: "" }),
      skill_name:   new fields.StringField({ initial: "" }),
      damage_level: new fields.StringField({ initial: "light", choices: ["light","heavy","lethal"] }),
      damage_type:  new fields.StringField({ initial: "physical", choices: ["physical","mental"] }),
      range:        new fields.NumberField({ initial: 0, integer: true }),
      size:         new fields.StringField({ initial: "medium", choices: ["pocket","finger","small","medium","large","huge","immovable"] }),
      ap:           new fields.NumberField({ initial: 0, integer: true }),
      rof:          new fields.NumberField({ initial: 1, integer: true }),
      equipped:     new fields.BooleanField({ initial: false }),
      has_status:   new fields.BooleanField({ initial: false }),
      status_uuid:  new fields.StringField({ initial: "" }),
      status_name:  new fields.StringField({ initial: "" }),
      notes:        new fields.StringField({ initial: "" })
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
      description:  new fields.HTMLField({ initial: "" }),
      vehicle_type: new fields.StringField({ initial: "ground", choices: ["ground","air","water","space","magical","other"] }),
      speed:        new fields.NumberField({ initial: 60, integer: true }),
      toughness:    new fields.NumberField({ initial: 8, integer: true }),
      capacity:     new fields.NumberField({ initial: 4, integer: true }),
      notes:        new fields.StringField({ initial: "" })
    };
  }
}

export class DeviceDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:  new fields.HTMLField({ initial: "" }),
      device_type:  new fields.StringField({ initial: "gadget", choices: ["gadget","weapon","drone","computer","medical","other"] }),
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
      description:    new fields.HTMLField({ initial: "" }),
      org_type:       new fields.StringField({ initial: "other", choices: ["academic","criminal","government","magical","corporate","underground","other"] }),
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
