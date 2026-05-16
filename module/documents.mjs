// ============================================================
// КК9 — Документы v0.4
// ============================================================

import { FACULTIES } from "./faculties.mjs";

export class KK9Actor extends Actor {

  // --- Смена факультета ---
  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);
    // Только если факультет реально изменился (не просто любое обновление)
    if (this.type === "character" 
        && changed.system?.faculty !== undefined 
        && changed.system.faculty !== null) {
      await this._onFacultyChanged(changed.system.faculty);
    }
  }

  async _onFacultyChanged(newFaculty) {
    if (!newFaculty || !FACULTIES[newFaculty]) return;
    const faculty = FACULTIES[newFaculty];
    const updateData = {};

    updateData["system.facultySkills"] = faculty.skills.map(s => ({
      name: s.name, die: s.die, linkedAttribute: s.linkedAttribute, modifier: 0
    }));

    const existingRelations = this.system.relations || [];
    const alreadyHasTeacher = existingRelations.some(r => r.name === faculty.teacher);
    if (!alreadyHasTeacher) {
      updateData["system.relations"] = [
        ...existingRelations,
        { name: faculty.teacher, status: "neutral", level: 0, notes: `Куратор ${faculty.label} факультета` }
      ];
    }

    await this.update(updateData);
    ChatMessage.create({
      content: `<div style="font-family:serif;padding:4px 8px;border-left:3px solid #c9a84c">
        <strong>${this.name}</strong> зачислен на <strong>${faculty.label} факультет</strong>.<br>
        <em>Добавлены навыки факультета и куратор ${faculty.teacher}.</em>
      </div>`,
      speaker: ChatMessage.getSpeaker({ actor: this })
    });
  }

  // --- Бросок атрибута ---
  async rollAttribute(attributeName, modifier = 0) {
    const attr = this.system.attributes?.[attributeName];
    if (!attr) return;

    const die = attr.die;
    const totalMod = (attr.modifier || 0) + modifier;
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWildCard = this.type === "character";
    const rollFormula = isWildCard ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;

    const attrLabels = {
      agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия"
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

  // --- Бросок инициативы: Ловкость + Смекалка ---
  async rollInitiative() {
    const agility = this.system.attributes.agility;
    const smarts  = this.system.attributes.smarts;
    const aMod = agility.modifier || 0;
    const sMod = smarts.modifier  || 0;

    // Wild Card: каждый атрибут + свой Wild Die, берём лучшее по каждому, складываем
    const isWildCard = this.type === "character";
    let formula, label;
    if (isWildCard) {
      formula = `{1d${agility.die}, 1d6}kh + {1d${smarts.die}, 1d6}kh`;
      label = `Инициатива (Ловкость d${agility.die} + Смекалка d${smarts.die}) — Wild Card`;
    } else {
      formula = `1d${agility.die} + 1d${smarts.die}`;
      label = `Инициатива (Ловкость + Смекалка)`;
    }

    const roll = new Roll(formula);
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${label}</strong><br>Результат: ${roll.total}`
    });
    return roll;
  }

  // --- Бросок стойкости с диалогом выбора скилла ---
  async rollToughness() {
    // Собираем доступные скиллы сопротивления из карточки
    const allSkills = [
      ...Object.entries(this.system.skills || {}).map(([k, v]) => ({ key: k, ...v })),
      ...(this.system.facultySkills || []).map(s => ({ key: s.name, ...s })),
      ...(this.system.customSkills  || []).map(s => ({ key: s.name, ...s }))
    ];

    const resistSkillNames = [
      "Противостояние пыткам",
      "Противостояние яду",
      "Противостояние истощению",
      "Выживание",
      "Выжидание"
    ];

    // Находим те что есть в карточке
    const available = allSkills.filter(s =>
      resistSkillNames.includes(s.name) || resistSkillNames.includes(s.key)
    );

    // Показываем диалог
    const options = available.map(s => {
      const name = s.name || s.key;
      const die  = s.die || 4;
      return `<option value="${name}|${die}">${name} (d${die})</option>`;
    }).join("");

    const content = `
      <div style="padding:8px">
        <p>Бросок Духа + (опционально) навык сопротивления</p>
        <label>Дополнительный навык:</label>
        <select id="resist-skill" style="width:100%;margin-top:4px">
          <option value="">— без навыка —</option>
          ${options}
        </select>
      </div>
    `;

    const result = await Dialog.prompt({
      title: "Бросок Стойкости",
      content,
      label: "Бросить",
      callback: html => {
        const sel = html.find("#resist-skill").val();
        return sel ? sel.split("|") : null;
      }
    });

    const spiritDie  = this.system.attributes.spirit.die;
    const spiritMod  = this.system.attributes.spirit.modifier || 0;
    const isWildCard = this.type === "character";

    let formula;
    if (result) {
      const [skillName, skillDie] = result;
      if (isWildCard) {
        formula = `{1d${spiritDie}, 1d6}kh + {1d${skillDie}, 1d6}kh`;
      } else {
        formula = `1d${spiritDie} + 1d${skillDie}`;
      }
    } else {
      formula = isWildCard ? `{1d${spiritDie}, 1d6}kh` : `1d${spiritDie}`;
    }

    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, 4);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>Стойкость</strong>${result ? ` + ${result[0]}` : ""}<br>${degree.label}`
    });
    return { roll, degree };
  }

  // --- Бросок навыка ---
  async rollSkill(skillName, modifier = 0, difficulty = 4) {
    const skillLabels = {
      athletics:"Атлетика", notice:"Внимание", stealth:"Скрытность",
      persuasion:"Убеждение", fighting:"Рукопашный бой",
      deception:"Обман", navigation:"Ориентирование", memory:"Память",
      knowledge:"Знания", intimidation:"Запугивание",
      survival:"Выживание", driving:"Вождение"
    };

    let skill = this.system.skills?.[skillName];
    let label = skillLabels[skillName] || skillName;

    if (!skill) {
      const fs = this.system.facultySkills?.find(s => s.name === skillName);
      if (fs) { skill = fs; label = fs.name; }
    }
    if (!skill) {
      const cs = this.system.customSkills?.find(s => s.name === skillName);
      if (cs) { skill = cs; label = cs.name; }
    }

    if (!skill) { ui.notifications.warn(`Навык "${skillName}" не найден.`); return; }

    const die    = skill.die;
    const mod    = (skill.modifier || 0) + modifier;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC   = this.type === "character";
    const formula = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;

    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, difficulty);

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${label}</strong> (сложность ${difficulty})<br>${degree.label}`
    });
    return { roll, degree };
  }

  _getSuccessDegree(total, difficulty = 4) {
    if (total < difficulty)          return { type: "failure",  label: `❌ Провал (${total})` };
    if (total >= difficulty + 4)     return { type: "critical", label: `⭐ Критический успех! (${total})` };
    return                                  { type: "success",  label: `✅ Успех (${total})` };
  }

  // --- Применить физический урон ---
  async applyDamage(damage) {
    if (this.type === "npc-light") {
      const toughness = this.system.health.toughness;
      if (damage >= toughness) {
        await this.update({ "system.health.value": Math.min(this.system.health.value + 1, 2) });
      }
    } else {
      const current   = this.system.health.physical.value;
      const toughness = this.system.health.physical.toughness;
      if (damage >= toughness) {
        const wounds   = Math.floor((damage - toughness) / 4) + 1;
        const newValue = Math.min(current + wounds, 5);
        await this.update({ "system.health.physical.value": newValue });
        const labels = ["здоров","царапина","ранен","тяжело ранен","критически ранен","без сознания"];
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: this }),
          content: `<strong>${this.name}</strong>: ${labels[newValue]}`
        });
      }
    }
  }
}

export class KK9Item extends Item {
  async rollDamage() {
    const dmg = this.system.damage;
    if (!dmg) { ui.notifications.warn("Урон не задан."); return; }
    const roll = new Roll(dmg);
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<strong>Урон: ${this.name}</strong>`
    });
    return roll;
  }
}
