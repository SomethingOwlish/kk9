// ============================================================
// КК9 — Data Models для НПС (замена существующих в data-models.mjs)
// ============================================================

const fields = foundry.data.fields;

// --- вспомогательные ---
function attributeField(initial = 6) {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial, choices: [4,6,8,10,12,20,100], integer: true })
  });
}

// --- Общий блок связей (переиспользуется во всех типах) ---
function relationsField() {
  return new fields.ArrayField(
    new fields.SchemaField({
      name:   new fields.StringField({ initial: "" }),
      status: new fields.StringField({ initial: "neutral", choices: ["ally","enemy","neutral","unknown"] }),
      level:  new fields.NumberField({ initial: 0, min: -15, max: 15, integer: true }),
      notes:  new fields.StringField({ initial: "" }),
      love:   new fields.BooleanField({ initial: false })
    })
  );
}

// ============================================================
// НПС ЛЁГКИЙ
// 2 ячейки физ + KO, 2 ячейки ментал + KO
// Только свои кубики (один die для всего)
// ============================================================
export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Общее ---
      role:        new fields.StringField({ initial: "" }),          // подзаголовок
      age:         new fields.StringField({ initial: "" }),
      race:        new fields.StringField({ initial: "" }),
      gender:      new fields.StringField({ initial: "" }),
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
      relations:      relationsField(),

      // --- Конфликт ---
      // Один кубик для лёгкого (d4–d100)
      die: new fields.NumberField({ required: true, initial: 6, choices: [4,6,8,10,12,20,100], integer: true }),

      initiative: new fields.NumberField({ initial: 0, integer: true }),
      toughness:  new fields.NumberField({ initial: 5, integer: true }),
      energy:     new fields.NumberField({ initial: 0, integer: true }),

      // Физическое: 2 ячейки + KO
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value:   new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
          knockout: new fields.BooleanField({ initial: false })
        }),
        mental: new fields.SchemaField({
          value:   new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
          knockout: new fields.BooleanField({ initial: false })
        })
      }),

      // Навыки и имущество хранятся как embedded Items через стандартный механизм Foundry
      // Дополнительных полей не нужно — items фильтруются в getData() по type
    };
  }
}

// ============================================================
// НПС СЛОЖНЫЙ
// Шкалы как у игрока (5 пипов физ + 5 ментал)
// Все 5 атрибутов, только свои кубики
// ============================================================
export class NpcHardDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Общее ---
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
      relations:      relationsField(),

      // --- Конфликт ---
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        magic:    attributeField(),
      }),

      initiative: new fields.NumberField({ initial: 0, integer: true }),
      toughness:  new fields.NumberField({ initial: 5, integer: true }),
      energy:     new fields.NumberField({ initial: 0, integer: true }),

      // Физическое: 5 ячеек (как игрок)
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
    // Стойкость = 2 + половина кубика Духа (как у игрока)
    this.toughness = 2 + Math.floor(this.attributes.spirit.die / 2);
  }
}

// ============================================================
// НПС НЕПОБЕДИМЫЙ (БОСС)
// Нет шкал здоровья. Бросает d6 + свои атрибуты (как игрок).
// Особая механика — текстовое поле
// ============================================================
export class NpcBossDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Общее ---
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
      relations:      relationsField(),

      // --- Конфликт ---
      attributes: new fields.SchemaField({
        agility:  attributeField(),
        smarts:   attributeField(),
        spirit:   attributeField(),
        strength: attributeField(),
        magic:    attributeField(),
      }),

      initiative:       new fields.NumberField({ initial: 0, integer: true }),
      toughness:        new fields.NumberField({ initial: 5, integer: true }),
      energy:           new fields.NumberField({ initial: 0, integer: true }),
      special_mechanics: new fields.HTMLField({ initial: "" }),
    };
  }
}
