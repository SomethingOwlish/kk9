// ============================================================
// КК9 — Дата-модели
// Здесь описана СТРУКТУРА данных каждого типа актёра и предмета.
// Foundry автоматически создаёт эти поля при создании нового актёра/предмета.
// ============================================================

const { fields } = foundry.data;

// ------------------------------------------------------------
// ВСПОМОГАТЕЛЬНЫЕ СХЕМЫ (переиспользуются в нескольких моделях)
// ------------------------------------------------------------

/**
 * Схема атрибута с кубиком (d4, d6, d8, d10, d12, d20)
 * Используется для Ловкости, Силы, Смекалки и т.д.
 */
function attributeField() {
  return new fields.SchemaField({
    // Размер кубика: 4, 6, 8, 10, 12 или 20
    die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    // Суммарный модификатор (бонусы от экипировки, состояний и т.д.)
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
  });
}

/**
 * Схема навыка (скилла)
 * У навыка есть кубик и атрибут, на котором он основан
 */
function skillField(linkedAttribute = "agility") {
  return new fields.SchemaField({
    die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
    linkedAttribute: new fields.StringField({ required: true, initial: linkedAttribute }),
    modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
    // Уникальные скиллы могут иметь произвольное имя
    label: new fields.StringField({ initial: "" })
  });
}

/**
 * Схема связи с НПС
 * Хранится как массив объектов внутри персонажа
 */
function npcRelationField() {
  return new fields.SchemaField({
    name: new fields.StringField({ required: true, initial: "Неизвестный" }),
    // Статус: ally (союзник), enemy (враг), neutral (нейтрал), unknown (неизвестно)
    status: new fields.StringField({
      required: true,
      initial: "neutral",
      choices: ["ally", "enemy", "neutral", "unknown"]
    }),
    // Уровень близости/отношений от -5 до +5
    level: new fields.NumberField({ required: true, initial: 0, min: -5, max: 5, integer: true }),
    notes: new fields.StringField({ initial: "" })
  });
}

// ------------------------------------------------------------
// АКТЁРЫ
// ------------------------------------------------------------

/**
 * Персонаж игрока (Wild Card)
 * Полная карточка с атрибутами, скиллами, двумя шкалами урона и связями
 */
export class CharacterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // --- Базовая информация ---
      biography: new fields.HTMLField({ initial: "" }),
      age: new fields.NumberField({ required: true, initial: 18, min: 0, integer: true }),
      academy_year: new fields.StringField({ initial: "1" }), // Год обучения в академии

      // --- Атрибуты (d4–d20) ---
      // Wild Card всегда бросает атрибут + Wild Die (d6), берёт лучшее
      attributes: new fields.SchemaField({
        agility:    attributeField(), // Ловкость
        smarts:     attributeField(), // Смекалка
        spirit:     attributeField(), // Дух
        strength:   attributeField(), // Сила
        vigor:      attributeField(), // Живучесть
      }),

      // --- Скиллы ---
      // Основные скиллы фиксированные, уникальные — в массиве customSkills
      skills: new fields.SchemaField({
        athletics:   skillField("agility"),   // Атлетика
        notice:      skillField("smarts"),    // Внимание
        stealth:     skillField("agility"),   // Скрытность
        persuasion:  skillField("spirit"),    // Убеждение
        fighting:    skillField("agility"),   // Рукопашный бой
        shooting:    skillField("agility"),   // Стрельба
        magic:       skillField("smarts"),    // Магия
        occult:      skillField("smarts"),    // Оккультизм
        investigation: skillField("smarts"),  // Расследование
        intimidation:  skillField("spirit"),  // Запугивание
        survival:    skillField("smarts"),    // Выживание
        driving:     skillField("agility"),   // Вождение
        hacking:     skillField("smarts"),    // Взлом (техн.)
        ritual:      skillField("spirit"),    // Ритуалистика
      }),

      // Уникальные/кастомные скиллы (список, редактируется в карточке)
      customSkills: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, initial: "Новый навык" }),
          die: new fields.NumberField({ required: true, initial: 4, choices: [4, 6, 8, 10, 12, 20] }),
          linkedAttribute: new fields.StringField({ initial: "smarts" }),
          modifier: new fields.NumberField({ initial: 0, integer: true })
        })
      ),

      // --- Физический урон (5 степеней) ---
      // 0=здоров, 1=царапина, 2=ранен, 3=тяжело ранен, 4=критически, 5=без сознания
      health: new fields.SchemaField({
        physical: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 5, integer: true }),
          // Порог выносливости (базово = Vigor die)
          toughness: new fields.NumberField({ required: true, initial: 4, integer: true })
        }),
        // Воля — пока просто поле, механику добавим позже
        will: new fields.SchemaField({
          value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 10, integer: true }),
          max: new fields.NumberField({ required: true, initial: 10, integer: true })
        })
      }),

      // --- Bennies (жетоны судьбы как в SW) ---
      bennies: new fields.NumberField({ required: true, initial: 3, min: 0, integer: true }),

      // --- Прочее ---
      pace: new fields.NumberField({ required: true, initial: 6, integer: true }), // Скорость передвижения
      parry: new fields.NumberField({ required: true, initial: 2, integer: true }), // Парирование
      notes: new fields.StringField({ initial: "" }),

      // --- Связи с НПС ---
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

  /**
   * prepareDerivedData вызывается автоматически после загрузки данных.
   * Здесь считаем производные значения (парирование, выносливость и т.д.)
   */
  prepareDerivedData() {
    // Парирование = 2 + половина кубика Атлетики
    const fightingDie = this.attributes.agility.die;
    this.parry = 2 + Math.floor(fightingDie / 2);

    // Выносливость = 2 + половина кубика Живучести
    const vigorDie = this.attributes.vigor.die;
    this.health.physical.toughness = 2 + Math.floor(vigorDie / 2);
  }
}

/**
 * НПС лёгкий — простые враги, быстро создаются и не занимают много места
 */
export class NpcLightDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      role: new fields.StringField({ initial: "Прохожий" }), // Роль в сцене
      // Упрощённые атрибуты — просто один кубик без деления
      die: new fields.NumberField({ required: true, initial: 6, choices: [4, 6, 8, 10, 12] }),
      // Физика всего 2 степени: здоров / выбыл
      health: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 0, min: 0, max: 2, integer: true }),
        toughness: new fields.NumberField({ required: true, initial: 5, integer: true })
      }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * НПС сложный — противники с полными атрибутами, могут иметь связи
 */
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

/**
 * НПС-босс / непобедимый — сюжетные фигуры, минимум механики
 */
export class NpcBossDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      threat_level: new fields.StringField({ initial: "высокая" }), // Уровень угрозы
      special_mechanics: new fields.StringField({ initial: "" }), // Описание спец. механик
      notes: new fields.StringField({ initial: "" })
    };
  }
}

// ------------------------------------------------------------
// ПРЕДМЕТЫ (Items)
// ------------------------------------------------------------

/**
 * Артефакт — магический или технологический предмет с особыми свойствами
 */
export class ArtifactDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      rarity: new fields.StringField({
        initial: "common",
        choices: ["common", "uncommon", "rare", "unique"]
      }),
      // Бонусы которые даёт артефакт
      bonuses: new fields.SchemaField({
        agility:  new fields.NumberField({ initial: 0, integer: true }),
        smarts:   new fields.NumberField({ initial: 0, integer: true }),
        spirit:   new fields.NumberField({ initial: 0, integer: true }),
        strength: new fields.NumberField({ initial: 0, integer: true }),
        vigor:    new fields.NumberField({ initial: 0, integer: true }),
        parry:    new fields.NumberField({ initial: 0, integer: true }),
        toughness:new fields.NumberField({ initial: 0, integer: true })
      }),
      // Требует активации или всегда работает?
      active: new fields.BooleanField({ initial: false }),
      // Урон если артефакт — оружие
      damage: new fields.StringField({ initial: "" }), // напр. "2d6", "Str+d6"
      equipped: new fields.BooleanField({ initial: false })
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
      // Стоимость в PP (Power Points) или воле — решим позже
      cost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
      range: new fields.StringField({ initial: "смотри описание" }), // "дальность"
      damage: new fields.StringField({ initial: "" }),  // "3d6", "специальное" и т.д.
      duration: new fields.StringField({ initial: "мгновенное" }),
      school: new fields.StringField({ initial: "" }), // Школа магии / тип
      // Требует ли броска и на каком атрибуте/навыке
      roll_skill: new fields.StringField({ initial: "magic" })
    };
  }
}

/**
 * Призывной демон
 */
export class DemonDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Собственные атрибуты демона
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
      // Особые способности демона (текстом)
      abilities: new fields.StringField({ initial: "" }),
      // Условие призыва
      summon_condition: new fields.StringField({ initial: "" }),
      // Стоимость призыва (воля, ритуал и т.д.)
      summon_cost: new fields.StringField({ initial: "" }),
      summoned: new fields.BooleanField({ initial: false }) // Сейчас призван?
    };
  }
}

/**
 * Уникальная абилка — просто текстовое описание способности
 */
export class AbilityDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      // Пассивная (всегда работает) или активная (требует действия)
      type: new fields.StringField({
        initial: "passive",
        choices: ["passive", "active"]
      }),
      // Если активная — что нужно для активации
      activation: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * Спутник — питомец, транспорт, техническое устройство
 */
export class CompanionDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      companion_type: new fields.StringField({
        initial: "pet",
        choices: ["pet", "vehicle", "device", "other"]
      }),
      // Базовые параметры
      speed: new fields.NumberField({ initial: 6, integer: true }),
      toughness: new fields.NumberField({ initial: 5, integer: true }),
      notes: new fields.StringField({ initial: "" })
    };
  }
}
