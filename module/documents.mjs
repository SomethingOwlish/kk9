// ============================================================
// КК9 — Кастомные классы документов
// Здесь живёт логика: броски кубиков, расчёты, методы
// ============================================================

/**
 * Кастомный Actor для КК9
 * Наследует стандартный Actor Foundry и добавляет нашу логику
 */
export class KK9Actor extends Actor {

  /**
   * Бросок атрибута
   * @param {string} attributeName - название атрибута (например "agility")
   * @param {number} modifier - дополнительный модификатор
   */
  async rollAttribute(attributeName, modifier = 0) {
    const data = this.system;
    const attr = data.attributes?.[attributeName];
    if (!attr) return;

    const die = attr.die;
    const totalMod = (attr.modifier || 0) + modifier;
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";

    // Wild Card бросает атрибут + Wild Die (d6), берёт лучшее
    const isWildCard = this.type === "character";

    let rollFormula, rollLabel;
    if (isWildCard) {
      rollFormula = `{1d${die}${modStr}, 1d6${modStr}}kh`;
      rollLabel = `Атрибут (Wild Card): 1d${die} и d6${modStr}`;
    } else {
      rollFormula = `1d${die}${modStr}`;
      rollLabel = `Атрибут: 1d${die}${modStr}`;
    }

    const roll = new Roll(rollFormula);
    await roll.evaluate();

    // Определяем степень успеха (порог по умолчанию 4)
    const result = roll.total;
    const degree = this._getSuccessDegree(result, 4);

    // Отправляем в чат
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${rollLabel}</strong><br>${degree.label}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    return { roll, degree };
  }

  /**
   * Бросок навыка
   * @param {string} skillName - ключ навыка (например "fighting")
   * @param {number} modifier - дополнительный модификатор
   * @param {number} difficulty - сложность броска (по умолчанию 4)
   */
  async rollSkill(skillName, modifier = 0, difficulty = 4) {
    const data = this.system;

    // Ищем в стандартных скиллах, потом в кастомных
    let skill = data.skills?.[skillName];
    let label = game.i18n.localize(`KK9.skills.${skillName}`) || skillName;

    if (!skill) {
      // Ищем в кастомных навыках
      const custom = data.customSkills?.find(s => s.name === skillName);
      if (custom) {
        skill = custom;
        label = custom.name;
      }
    }

    if (!skill) {
      ui.notifications.warn(`Навык "${skillName}" не найден у ${this.name}`);
      return;
    }

    const die = skill.die;
    const totalMod = (skill.modifier || 0) + modifier;
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";

    const isWildCard = this.type === "character";

    let rollFormula;
    if (isWildCard) {
      rollFormula = `{1d${die}${modStr}, 1d6${modStr}}kh`;
    } else {
      rollFormula = `1d${die}${modStr}`;
    }

    const roll = new Roll(rollFormula);
    await roll.evaluate();

    const degree = this._getSuccessDegree(roll.total, difficulty);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>Навык: ${label}</strong> (сложность ${difficulty})<br>${degree.label}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    return { roll, degree };
  }

  /**
   * Определяет степень успеха броска
   * Провал: ниже сложности
   * Успех: равно или выше сложности
   * Крит: выше сложности на 4+ (raise в Savage Worlds)
   */
  _getSuccessDegree(total, difficulty = 4) {
    if (total < difficulty) {
      return {
        type: "failure",
        label: `❌ Провал (${total})`,
        css: "kk9-failure"
      };
    } else if (total >= difficulty + 4) {
      return {
        type: "critical",
        label: `⭐ Критический успех! (${total})`,
        css: "kk9-critical"
      };
    } else {
      return {
        type: "success",
        label: `✅ Успех (${total})`,
        css: "kk9-success"
      };
    }
  }

  /**
   * Получение урона (физического)
   * @param {number} damage - количество урона
   */
  async applyDamage(damage) {
    if (this.type === "npc-light") {
      // Лёгкий НПС: 2 степени
      const currentHealth = this.system.health.value;
      const toughness = this.system.health.toughness;
      if (damage >= toughness) {
        await this.update({ "system.health.value": Math.min(currentHealth + 1, 2) });
      }
    } else {
      // Персонаж и сложный НПС: 5 степеней
      const currentHealth = this.system.health.physical.value;
      const toughness = this.system.health.physical.toughness;
      if (damage >= toughness) {
        const wounds = Math.floor((damage - toughness) / 4) + 1;
        const newHealth = Math.min(currentHealth + wounds, 5);
        await this.update({ "system.health.physical.value": newHealth });

        // Сообщение о ранении
        const labels = ["здоров", "царапина", "ранен", "тяжело ранен", "критически ранен", "без сознания"];
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<strong>${this.name}</strong> получает урон. Состояние: <strong>${labels[newHealth]}</strong>`
        });
      }
    }
  }
}

/**
 * Кастомный Item для КК9
 */
export class KK9Item extends Item {

  /**
   * Бросок урона для артефакта или заклинания
   */
  async rollDamage() {
    const data = this.system;
    const damageFormula = data.damage;

    if (!damageFormula) {
      ui.notifications.warn("У этого предмета не задан урон.");
      return;
    }

    const roll = new Roll(damageFormula);
    await roll.evaluate();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<strong>Урон: ${this.name}</strong>`,
      rollMode: game.settings.get("core", "rollMode")
    });

    return roll;
  }
}
