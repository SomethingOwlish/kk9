// ============================================================
// КК9 — Кастомные классы документов
// ============================================================

import { FACULTIES } from "./faculties.mjs";

export class KK9Actor extends Actor {

  // ----------------------------------------------------------
  // При обновлении актёра — отслеживаем смену факультета
  // ----------------------------------------------------------
  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);

    // Проверяем: изменился ли факультет?
    if (this.type === "character" && changed.system?.faculty !== undefined) {
      await this._onFacultyChanged(changed.system.faculty);
    }
  }

  /**
   * Вызывается когда игрок выбирает факультет.
   * Добавляет скиллы факультета и учителя в связи.
   */
  async _onFacultyChanged(newFaculty) {
    if (!newFaculty || !FACULTIES[newFaculty]) return;

    const faculty = FACULTIES[newFaculty];
    const updateData = {};

    // 1. Добавляем скиллы факультета
    updateData["system.facultySkills"] = faculty.skills.map(s => ({
      name: s.name,
      die: s.die,
      linkedAttribute: s.linkedAttribute,
      modifier: 0
    }));

    // 2. Добавляем учителя в связи (если его там ещё нет)
    const existingRelations = this.system.relations || [];
    const teacherName = faculty.teacher;
    const alreadyHasTeacher = existingRelations.some(r => r.name === teacherName);

    if (!alreadyHasTeacher) {
      updateData["system.relations"] = [
        ...existingRelations,
        {
          name: teacherName,
          status: "neutral",
          level: 0,
          notes: `Куратор ${faculty.label} факультета`
        }
      ];
    }

    await this.update(updateData);

    // Уведомление в чат
    ChatMessage.create({
      content: `<div style="font-family:serif;padding:4px 8px;border-left:3px solid #c9a84c">
        <strong>${this.name}</strong> зачислен на <strong>${faculty.label} факультет</strong>.<br>
        <em>Добавлены навыки факультета и куратор ${teacherName}.</em>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: this })
    });
  }

  // ----------------------------------------------------------
  // Бросок атрибута
  // ----------------------------------------------------------
  async rollAttribute(attributeName, modifier = 0) {
    const attr = this.system.attributes?.[attributeName];
    if (!attr) return;

    const die = attr.die;
    const totalMod = (attr.modifier || 0) + modifier;
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWildCard = this.type === "character";

    const rollFormula = isWildCard
      ? `{1d${die}${modStr}, 1d6${modStr}}kh`
      : `1d${die}${modStr}`;

    const attrLabels = {
      agility: "Ловкость", smarts: "Смекалка", spirit: "Дух",
      strength: "Сила", vigor: "Живучесть"
    };

    const roll = new Roll(rollFormula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, 4);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${attrLabels[attributeName] || attributeName}</strong>${isWildCard ? " + Wild Die" : ""}<br>${degree.label}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    return { roll, degree };
  }

  // ----------------------------------------------------------
  // Бросок навыка (стандартного, факультетского или кастомного)
  // ----------------------------------------------------------
  async rollSkill(skillName, modifier = 0, difficulty = 4) {
    const data = this.system;

    const skillLabels = {
      athletics: "Атлетика", notice: "Внимание", stealth: "Скрытность",
      persuasion: "Убеждение", fighting: "Рукопашный бой", shooting: "Стрельба",
      magic: "Магия", occult: "Оккультизм", investigation: "Расследование",
      intimidation: "Запугивание", survival: "Выживание", driving: "Вождение",
      hacking: "Взлом", ritual: "Ритуалистика"
    };

    let skill = data.skills?.[skillName];
    let label = skillLabels[skillName] || skillName;

    // Ищем в скиллах факультета
    if (!skill) {
      const fs = data.facultySkills?.find(s => s.name === skillName);
      if (fs) { skill = fs; label = fs.name; }
    }

    // Ищем в кастомных
    if (!skill) {
      const cs = data.customSkills?.find(s => s.name === skillName);
      if (cs) { skill = cs; label = cs.name; }
    }

    if (!skill) {
      ui.notifications.warn(`Навык "${skillName}" не найден у ${this.name}`);
      return;
    }

    const die = skill.die;
    const totalMod = (skill.modifier || 0) + modifier;
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWildCard = this.type === "character";

    const rollFormula = isWildCard
      ? `{1d${die}${modStr}, 1d6${modStr}}kh`
      : `1d${die}${modStr}`;

    const roll = new Roll(rollFormula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, difficulty);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${label}</strong> (сложность ${difficulty})<br>${degree.label}`,
      rollMode: game.settings.get("core", "rollMode")
    });

    return { roll, degree };
  }

  // ----------------------------------------------------------
  // Степень успеха
  // ----------------------------------------------------------
  _getSuccessDegree(total, difficulty = 4) {
    if (total < difficulty) {
      return { type: "failure", label: `❌ Провал (${total})` };
    } else if (total >= difficulty + 4) {
      return { type: "critical", label: `⭐ Критический успех! (${total})` };
    } else {
      return { type: "success", label: `✅ Успех (${total})` };
    }
  }

  // ----------------------------------------------------------
  // Получение физического урона
  // ----------------------------------------------------------
  async applyDamage(damage) {
    if (this.type === "npc-light") {
      const current = this.system.health.value;
      const toughness = this.system.health.toughness;
      if (damage >= toughness) {
        await this.update({ "system.health.value": Math.min(current + 1, 2) });
      }
    } else {
      const current = this.system.health.physical.value;
      const toughness = this.system.health.physical.toughness;
      if (damage >= toughness) {
        const wounds = Math.floor((damage - toughness) / 4) + 1;
        const newHealth = Math.min(current + wounds, 5);
        await this.update({ "system.health.physical.value": newHealth });
        const labels = ["здоров", "царапина", "ранен", "тяжело ранен", "критически ранен", "без сознания"];
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<strong>${this.name}</strong>: ${labels[newHealth]}`
        });
      }
    }
  }
}

export class KK9Item extends Item {
  async rollDamage() {
    const damageFormula = this.system.damage;
    if (!damageFormula) {
      ui.notifications.warn("У этого предмета не задан урон.");
      return;
    }
    const roll = new Roll(damageFormula);
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<strong>Урон: ${this.name}</strong>`
    });
    return roll;
  }
}
