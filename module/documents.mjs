// ============================================================
// КК9 — Документы v0.5
// ============================================================

export class KK9Actor extends Actor {

  // ----------------------------------------------------------
  // Дроп предмета на актёра — перехватываем faculty
  // ----------------------------------------------------------
  async _onDropItem(event, data) {
    const item = await Item.fromDropData(data);
    if (!item) return super._onDropItem(event, data);

    // Если дропнули faculty item — применяем факультет
    if (item.type === "faculty") {
      await this._applyFaculty(item);
      return;
    }

    return super._onDropItem(event, data);
  }

  /**
   * Применяем факультет по имени (из выпадашки) — ищем в компендиуме
   * @param {string} facultyName
   */
  async applyFacultyByName(facultyName) {
    if (!facultyName) {
      // Сбрасываем факультет
      await this.update({
        "system.faculty": null,
        "system.faculty_color": "",
        "system.faculty_key": "",
        "system.faculty_name": ""
      });
      return;
    }

    // Ищем faculty item в компендиуме
    const pack = game.packs.get("kk9.kk9-faculties");
    if (pack) {
      await pack.getIndex();
      const entry = pack.index.find(i => i.name === facultyName);
      if (entry) {
        const item = await pack.getDocument(entry._id);
        if (item) { await this._applyFaculty(item); return; }
      }
    }

    // Ищем в world items
    const worldItem = game.items.find(i => i.type === "faculty" && i.name === facultyName);
    if (worldItem) { await this._applyFaculty(worldItem); return; }

    ui.notifications.warn(`Факультет "${facultyName}" не найден в компендиуме.`);
  }

  /**
   * Применяем факультет из faculty item
   * @param {Item} facultyItem
   */
  async _applyFaculty(facultyItem) {
    if (this.type !== "character") return;

    const oldFacultyId = this.system.faculty;

    // --- Убираем старый факультет ---
    if (oldFacultyId) {
      const toRemove = this.items.filter(i =>
        i.type === "ability" && i.system.faculty_id === oldFacultyId
      );
      // Только magic остаётся (теряет привязку к факультету)
      // common/learned/personal — удаляются при смене факультета
      const toKeep = toRemove.filter(i => i.system.category === "magic");
      const toDelete = toRemove.filter(i => i.system.category !== "magic");

      // magic → убираем привязку, остаются на карточке
      for (const item of toKeep) {
        await item.update({ "system.faculty_id": null });
      }
      // всё остальное (включая common/learned) → удаляем
      for (const item of toDelete) {
        await item.delete();
      }
    }

    // --- Добавляем новый факультет ---
    const fData = facultyItem.system;
    const updateData = {
      "system.faculty":       facultyItem.id,
      "system.faculty_color": fData.color || "#888888",
      "system.faculty_key":   facultyItem.id,
      "system.faculty_name":  facultyItem.name
    };

    // Добавляем учителя в связи
    const relations = [...(this.system.relations || [])];
    const teacherName = fData.teacher;
    if (teacherName && !relations.find(r => r.name === teacherName)) {
      relations.push({ name: teacherName, status: "neutral", level: 0, notes: `Куратор факультета ${facultyItem.name}`, love: false });
      updateData["system.relations"] = relations;
    }

    await this.update(updateData);

    // Создаём копии ability items факультета на персонаже
    if (fData.abilities?.length) {
      for (const abilityRef of fData.abilities) {
        // Ищем оригинал в компендиумах или world items
        let sourceItem = game.items.get(abilityRef.itemId);
        if (!sourceItem) {
          for (const pack of game.packs) {
            if (pack.documentName !== "Item") continue;
            sourceItem = await pack.getDocument(abilityRef.itemId).catch(() => null);
            if (sourceItem) break;
          }
        }

        if (sourceItem) {
          const itemData = sourceItem.toObject();
          itemData.system.faculty_id = facultyItem.id;
          await Item.create(itemData, { parent: this });
        } else {
          // Если оригинала нет — создаём по данным из faculty
          await Item.create({
            name: abilityRef.name,
            type: "ability",
            system: {
              category: abilityRef.category || "common",
              faculty_id: facultyItem.id,
              description: ""
            }
          }, { parent: this });
        }
      }
    }

    // Уведомление
    ChatMessage.create({
      content: `<div style="font-family:serif;padding:4px 8px;border-left:3px solid ${fData.color || '#c9a84c'}">
        <strong>${this.name}</strong> зачислен на <strong>${facultyItem.name}</strong>.<br>
        <em>Способности факультета добавлены${teacherName ? `, куратор ${teacherName} добавлен в связи` : ""}.</em>
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
    const mod = (attr.modifier || 0) + modifier;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC = this.type === "character";
    const formula = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;
    const labels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", strength:"Сила", magic:"Магия" };
    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, 4);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${labels[attributeName] || attributeName}</strong>${isWC ? " + Wild Die" : ""}<br>${degree.label}`
    });
    return { roll, degree };
  }

  // ----------------------------------------------------------
  // Бросок инициативы: Ловкость + Смекалка
  // ----------------------------------------------------------
  async rollInitiative() {
    const ag = this.system.attributes.agility;
    const sm = this.system.attributes.smarts;
    const isWC = this.type === "character";
    const formula = isWC
      ? `{1d${ag.die}, 1d6}kh + {1d${sm.die}, 1d6}kh`
      : `1d${ag.die} + 1d${sm.die}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>Инициатива</strong> (Ловкость + Смекалка)<br>Результат: ${roll.total}`
    });
    return roll;
  }

  // ----------------------------------------------------------
  // Бросок стойкости с диалогом
  // ----------------------------------------------------------
  async rollToughness() {
    const allSkills = [
      ...Object.entries(this.system.skills || {}).map(([k,v]) => ({ key:k, name:k, ...v })),
      ...(this.system.customSkills || []).map(s => ({ key:s.name, ...s })),
      ...(this.items?.filter(i => i.type === "ability") || []).map(i => ({ key:i.name, name:i.name, die:4 }))
    ];

    const resistNames = ["Противостояние пыткам","Противостояние яду","Противостояние истощению","Выживание","Выжидание"];
    const available = allSkills.filter(s => resistNames.includes(s.name) || resistNames.includes(s.key));

    const options = available.map(s =>
      `<option value="${s.name||s.key}|${s.die||4}">${s.name||s.key} (d${s.die||4})</option>`
    ).join("");

    const result = await Dialog.prompt({
      title: "Бросок Стойкости",
      content: `<div style="padding:8px">
        <p style="margin-bottom:8px">Дух${available.length ? " + навык сопротивления" : ""}</p>
        ${available.length ? `<select id="resist-skill" style="width:100%">
          <option value="">— только Дух —</option>
          ${options}
        </select>` : "<em>Нет доступных навыков сопротивления</em>"}
      </div>`,
      label: "Бросить",
      callback: html => html.find("#resist-skill").val() || null
    });

    const spiritDie = this.system.attributes.spirit.die;
    const isWC = this.type === "character";
    let formula;
    if (result) {
      const [, skillDie] = result.split("|");
      formula = isWC ? `{1d${spiritDie}, 1d6}kh + {1d${skillDie}, 1d6}kh` : `1d${spiritDie} + 1d${skillDie}`;
    } else {
      formula = isWC ? `{1d${spiritDie}, 1d6}kh` : `1d${spiritDie}`;
    }

    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, 4);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>Стойкость</strong>${result ? ` + ${result.split("|")[0]}` : ""}<br>${degree.label}`
    });
    return { roll, degree };
  }

  // ----------------------------------------------------------
  // Бросок навыка
  // ----------------------------------------------------------
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
      const cs = this.system.customSkills?.find(s => s.name === skillName);
      if (cs) { skill = cs; label = cs.name; }
    }

    if (!skill) { ui.notifications.warn(`Навык "${skillName}" не найден.`); return; }

    const die = skill.die;
    const mod = (skill.modifier || 0) + modifier;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC = this.type === "character";
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

  // ----------------------------------------------------------
  // Бросок навыка по itemId (skill Item)
  // ----------------------------------------------------------
  async rollSkillItem(itemId, difficulty = 4) {
    const item = this.items.get(itemId);
    if (!item) { ui.notifications.warn("Навык не найден."); return; }
    const die = item.system.die || 4;
    const mod = item.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC = this.type === "character";
    const formula = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, difficulty);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${item.name}</strong> (d${die}${modStr})<br>${degree.label}`
    });
    return { roll, degree };
  }

  // ----------------------------------------------------------
  // Бросок способности по itemId
  // ----------------------------------------------------------
  async rollAbility(itemId, difficulty = 4) {
    const item = this.items.get(itemId);
    if (!item) { ui.notifications.warn("Способность не найдена."); return; }
    const die = item.system.die || 4;
    const mod = item.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC = this.type === "character";
    const formula = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    const degree = this._getSuccessDegree(roll.total, difficulty);
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<strong>${item.name}</strong> (сложность ${difficulty})<br>${degree.label}`
    });
    return { roll, degree };
  }

  _getSuccessDegree(total, difficulty = 4) {
    if (total < difficulty)      return { type:"failure",  label:`❌ Провал (${total})` };
    if (total >= difficulty + 4) return { type:"critical", label:`⭐ Критический успех! (${total})` };
    return                              { type:"success",  label:`✅ Успех (${total})` };
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
