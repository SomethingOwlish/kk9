// ============================================================
// КК9 — documents.mjs v1.2 «Здоровье и состояние»
// ============================================================

// ============================================================
// Цвета факультетов
// ============================================================
const FACULTY_COLORS = {
  white:     "#e8e8e8",
  black:     "#888888",
  blue:      "#3b82f6",
  green:     "#22c55e",
  purple:    "#a855f7",
  red:       "#ef4444",
  brown:     "#92400e",
  mercury:   "#94a3b8",
  invisible: "#6b7280",
};
const NEUTRAL_NAME_COLOR = "#c4a44a";

// ============================================================
// Атрибуты по группам
// ============================================================
const PHYS_ATTRS   = new Set(["agility", "endurance", "magic"]);
const MENTAL_ATTRS = new Set(["smarts", "spirit", "magic"]);

// ============================================================
// Состояние предметов → модификаторы
//
// Weapon / Gear / Device используют: perfect | good | worn | broken
// Artifact: destroyed (bool) = broken; active + equipped = работает
//
// Правило броска:
//   broken / destroyed → нельзя бросать
//   worn               → −1 к броску, баффы ×0.5
//   good               → без изменений
//   perfect            → +1 к броску, баффы полные
// ============================================================
function _conditionMod(condition) {
  // condition — строка из Weapon/Gear/Device
  switch (condition) {
    case "broken":  return { mod: 0,  buffMult: 0,   blocked: true  };
    case "worn":    return { mod: -1, buffMult: 0.5, blocked: false };
    case "good":    return { mod: 0,  buffMult: 1,   blocked: false };
    case "perfect": return { mod: 1,  buffMult: 1,   blocked: false };
    default:        return { mod: 0,  buffMult: 1,   blocked: false };
  }
}

// ============================================================
// KK9Actor
// ============================================================
export class KK9Actor extends Actor {

  _getFacultyColor() {
    // Персонажи хранят цвет в faculty_color напрямую
    if (this.system?.faculty_color) return this.system.faculty_color;
    const k = this.system?.faculty;
    if (!k || k === "none") return NEUTRAL_NAME_COLOR;
    return FACULTY_COLORS[k] || NEUTRAL_NAME_COLOR;
  }

  // ----------------------------------------------------------
  // ШТРАФЫ ОТ ЗДОРОВЬЯ
  //
  // Пип 0           → без штрафов
  // Пип 1           → −1 на зависимые броски
  // Пип 2           → −2 на зависимые
  // Пип 3           → −4 на зависимые, −2 на все остальные
  // Пип 4           → результат зависимых пополам + −4 на остальные
  // Пип 5           → только бросок стойкости
  //
  // "Зависимые физ"   = навыки/атрибуты: Ловкость, Сила, Магия
  // "Зависимые ментал"= навыки/атрибуты: Смекалка, Дух, Магия
  // Модификаторы не суммируются — берётся максимальный штраф
  // ----------------------------------------------------------
  _getHealthPenalties() {
    const phys   = this.system?.health?.physical?.value ?? 0;
    const mental = this.system?.health?.mental?.value   ?? 0;

    const none = { physPenalty:0, mentalPenalty:0, allPenalty:0,
                   halfResult:false, onlyToughness:false, physHalf:false, mentalHalf:false };

    if (phys === 0 && mental === 0) return none;

    if (phys >= 5 || mental >= 5) {
      return { ...none, onlyToughness: true };
    }

    const worst = Math.max(phys, mental);

    if (worst >= 4) {
      return { physPenalty:0, mentalPenalty:0, allPenalty:-4,
               halfResult:true, onlyToughness:false,
               physHalf: phys >= 4, mentalHalf: mental >= 4 };
    }
    if (worst >= 3) {
      return { physPenalty:   phys   >= 3 ? -4 : 0,
               mentalPenalty: mental >= 3 ? -4 : 0,
               allPenalty: -2, halfResult:false, onlyToughness:false,
               physHalf:false, mentalHalf:false };
    }
    if (worst >= 2) {
      return { physPenalty:   phys   >= 2 ? -2 : 0,
               mentalPenalty: mental >= 2 ? -2 : 0,
               allPenalty: 0, halfResult:false, onlyToughness:false,
               physHalf:false, mentalHalf:false };
    }
    // Пип 1
    return { physPenalty:   phys   >= 1 ? -1 : 0,
             mentalPenalty: mental >= 1 ? -1 : 0,
             allPenalty: 0, halfResult:false, onlyToughness:false,
             physHalf:false, mentalHalf:false };
  }

  // Возвращает { mod, halfResult, blocked, reasons[] } для конкретного атрибута
  _getHealthModForAttr(attrKey, isToughness = false) {
    const p = this._getHealthPenalties();

    if (p.onlyToughness && !isToughness)
      return { mod:0, halfResult:false, blocked:true, reasons:["последний пип — только стойкость"] };
    if (p.onlyToughness && isToughness)
      return { mod:0, halfResult:false, blocked:false, reasons:[] };

    const isPhys   = PHYS_ATTRS.has(attrKey);
    const isMental = MENTAL_ATTRS.has(attrKey);

    // Пип 4: зависимые — halfResult + allPenalty, остальные — только allPenalty
    if (p.halfResult) {
      const affected = (p.physHalf && isPhys) || (p.mentalHalf && isMental);
      const reasons  = affected ? ["результат пополам (пип 4)"] : [];
      if (p.allPenalty) reasons.push(`общий штраф ${p.allPenalty}`);
      return { mod: p.allPenalty, halfResult: affected, blocked: false, reasons };
    }

    // Пип 1-3: берём наихудший из применимых штрафов (не суммируем)
    let depPenalty = 0;
    if (attrKey === "magic") {
      // Магия входит в обе группы — берём наихудший
      depPenalty = Math.min(p.physPenalty, p.mentalPenalty);
    } else if (isPhys) {
      depPenalty = p.physPenalty;
    } else if (isMental) {
      depPenalty = p.mentalPenalty;
    }

    // Итоговый mod: для зависимых — depPenalty, для остальных — allPenalty
    // Если оба применимы — берём наихудший (max по модулю, то есть min по значению)
    let finalMod = 0;
    if (isPhys || isMental) {
      finalMod = Math.min(depPenalty, p.allPenalty);
    } else {
      finalMod = p.allPenalty;
    }

    const reasons = [];
    if (finalMod < 0) reasons.push(`штраф здоровья ${finalMod}`);
    return { mod: finalMod, halfResult: false, blocked: false, reasons };
  }

  // ----------------------------------------------------------
  // Модификатор от состояния предмета (Weapon, Gear, Device)
  // ----------------------------------------------------------
  _getItemConditionMod(item) {
    if (!item) return { mod: 0, buffMult: 1, blocked: false };

    // Артефакт: бонусы дают только если equipped=true И active=true
    // condition влияет на ВЕЛИЧИНУ бонусов поверх активности
    if (item.type === "artifact") {
      const cond = item.system.condition ?? "good";
      if (cond === "broken") return { blocked: true,  buffActive: false, buffTier: "broken" };
      if (item.system.equipped !== "equipped" || !item.system.active)
        return { blocked: false, buffActive: false, buffTier: "inactive" };
      // Активен + экипирован — condition определяет модификатор бонусов
      if (cond === "perfect") return { blocked: false, buffActive: true, buffTier: "perfect" };
      if (cond === "worn")    return { blocked: false, buffActive: true, buffTier: "worn" };
      return { blocked: false, buffActive: true, buffTier: "normal" }; // good
    }

    // Weapon / Gear / Device
    const condition = item.system?.condition ?? "good";
    return _conditionMod(condition);
  }

  // ----------------------------------------------------------
  // HTML карточки броска в чате
  // ----------------------------------------------------------
  _buildRollMessage(label, degree, rollHtml = "", modReasons = []) {
    const portrait    = this.img || "icons/svg/mystery-man.svg";
    const nameColor   = this._getFacultyColor();
    const accentColor = nameColor === NEUTRAL_NAME_COLOR ? "#c4a44a" : nameColor;

    const resultClass = {
      snake_eyes: "kk9-result-snake",
      failure:    "kk9-result-failure",
      success:    "kk9-result-success",
    }[degree.type] || "kk9-result-success";


    return [
      `<div class="kk9-chat-roll" data-result-type="${degree.type}" style="--accent:${accentColor}">`,
      `  <div class="kk9-chat-header">`,
      `    <img class="kk9-chat-portrait" src="${portrait}" alt="${this.name}">`,
      `    <div class="kk9-chat-header-text">`,
      `      <span class="kk9-chat-name">${this.name}</span>`,
      `      <span class="kk9-chat-label">${label}</span>`,
      `    </div>`,
      `  </div>`,
      `  <details class="kk9-result-details">`,
      `    <summary class="kk9-result-summary ${resultClass}">`,
      `      <span class="kk9-result-text">${degree.label}</span>`,
      `    </summary>`,
      rollHtml ? `    <div class="kk9-dice-body">${rollHtml}</div>` : "",
      `  </details>`,
      `</div>`
    ].filter(Boolean).join("\n");
  }

  // ----------------------------------------------------------
  // Числовой результат для инициативы
  // ----------------------------------------------------------
  _buildInitiativeMessage(label, total, rollHtml = "") {
    const portrait    = this.img || "icons/svg/mystery-man.svg";
    const nameColor   = this._getFacultyColor();
    const accentColor = nameColor === NEUTRAL_NAME_COLOR ? "#c4a44a" : nameColor;

    return [
      `<div class="kk9-chat-roll" data-result-type="initiative" style="--accent:${accentColor}">`,
      `  <div class="kk9-chat-header">`,
      `    <img class="kk9-chat-portrait" src="${portrait}" alt="${this.name}">`,
      `    <div class="kk9-chat-header-text">`,
      `      <span class="kk9-chat-name">${this.name}</span>`,
      `      <span class="kk9-chat-label">${label}</span>`,
      `    </div>`,
      `  </div>`,
      `  <details class="kk9-result-details">`,
      `    <summary class="kk9-result-summary kk9-result-initiative">`,
      `      <span class="kk9-result-text">${total}</span>`,
      `    </summary>`,
      rollHtml ? `    <div class="kk9-dice-body">${rollHtml}</div>` : "",
      `  </details>`,
      `</div>`
    ].filter(Boolean).join("\n");
  }

  // ----------------------------------------------------------
  // Механика успехов
  // ----------------------------------------------------------
  _getSuccessDegree(roll, halfResult = false) {
    return this._getSuccessDegreeFromTotal(roll.total, halfResult, roll);
  }

  _getSuccessDegreeFromTotal(total, halfResult = false, roll = null) {
    if (halfResult) total = Math.floor(total / 2);

    const diceTerms     = roll?.terms?.filter(t => Array.isArray(t.results)) ?? [];
    const activeResults = diceTerms.flatMap(t => t.results.filter(r => r.active !== false));

    const allOnes       = activeResults.length >= 2 && activeResults.every(r => r.result === 1);
    const negativeTotal = total <= 0;

    if (allOnes || negativeTotal)
      return { type: "snake_eyes", label: "Глаза змеи", successes: 0 };
    if (total < 6)
      return { type: "failure", label: "Неудача", successes: 0 };

    const successes = 1 + Math.floor((total - 6) / 4);
    const label = successes === 1 ? "1 успех"
                : successes <= 4  ? `${successes} успеха`
                :                   `${successes} успехов`;
    return { type: "success", label, successes };
  }

  // ----------------------------------------------------------
  // Формула — взрывающиеся кубики
  // ----------------------------------------------------------
  _rollFormula(die, modStr, isWC) {
    // Бонусы прибавляются ПОСЛЕ выбора максимума из пула
    const mod = modStr ? ` ${modStr}` : "";
    return isWC
      ? `{1d${die}x, 1d6x}kh${mod}`.trim()
      : `1d${die}x${mod}`.trim();
  }

  // ----------------------------------------------------------
  // HTML кубиков
  // ----------------------------------------------------------
  // Строит HTML для раздела "кубики" в details
  _buildDiceHtml(roll, modReasons = [], overrideTotal = null) {
    const lines = [];

    // Рекурсивно собираем Die-термы из структуры Foundry v13
    const collectDice = (terms) => {
      const acc = [];
      for (const t of terms) {
        // Die: есть faces (число) и results (массив)
        if (typeof t.faces === "number" && Array.isArray(t.results)) {
          acc.push(t);
        }
        // PoolTerm: есть .rolls (массив Roll-объектов)
        else if (Array.isArray(t.rolls)) {
          for (const r of t.rolls) {
            if (r?.terms) acc.push(...collectDice(r.terms));
          }
        }
        // ParentheticalTerm или вложенный Roll
        else if (t.roll?.terms) {
          acc.push(...collectDice(t.roll.terms));
        }
        // Любой термин с .terms (RollTerm subclass)
        else if (Array.isArray(t.terms)) {
          acc.push(...collectDice(t.terms));
        }
      }
      return acc;
    };
    // Числовые модификаторы формулы — не выводим отдельно (они в reasons)
    const numericMods = []; // убрано: дублирует reasons

    // Строим строки для каждого Die с учётом pool.results (active/discarded)
    // Foundry PoolTerm хранит discarded в pool.results[], а не в Die.results[]
    const renderDice = (terms) => {
      for (const t of terms) {
        // PoolTerm: t.rolls — массив Roll, t.results — active/discarded
        if (Array.isArray(t.rolls) && Array.isArray(t.results)) {
          t.rolls.forEach((roll, idx) => {
            const poolEntry   = t.results[idx] ?? {};
            const isDiscarded = poolEntry.active === false || poolEntry.discarded === true;
            // Найти Die внутри этого Roll
            const die = roll.terms?.find(dt => typeof dt.faces === "number" && Array.isArray(dt.results));
            if (!die) return;
            const faces   = die.faces;
            const results = die.results ?? [];
            // Значения с учётом взрывных (результат всей цепочки взрывного кубика)
            const rollStr = results.map(r => {
              const boom = r.exploded ? "💥" : "";
              return `<span class="kk9-rv ${isDiscarded ? "dr" : "dk"}">${boom}${r.result}</span>`;
            }).join('<span class="kk9-rplus">+</span>');
            const total    = results.reduce((s, r) => s + r.result, 0);
            const rowClass = isDiscarded ? "kk9-drow discarded" : "kk9-drow kept";
            lines.push(
              `<div class="${rowClass}">` +
              `<span class="kk9-dlabel">d${faces}</span>` +
              `<span class="kk9-dvals">${rollStr}</span>` +
              (!isDiscarded ? `<span class="kk9-dsum">= ${total}</span>` : "") +
              `</div>`
            );
          });
        }
        // Обычный Die без пула (НПС без wild die)
        else if (typeof t.faces === "number" && Array.isArray(t.results)) {
          const faces   = t.faces;
          const results = t.results ?? [];
          const rollStr = results.map(r => {
            const boom = r.exploded ? "💥" : "";
            return `<span class="kk9-rv dk">${boom}${r.result}</span>`;
          }).join('<span class="kk9-rplus">+</span>');
          const total = results.reduce((s, r) => s + r.result, 0);
          lines.push(
            `<div class="kk9-drow kept">` +
            `<span class="kk9-dlabel">d${faces}</span>` +
            `<span class="kk9-dvals">${rollStr}</span>` +
            `<span class="kk9-dsum">= ${total}</span>` +
            `</div>`
          );
        }
        // Рекурсия для вложенных термов
        else if (Array.isArray(t.terms)) renderDice(t.terms);
        else if (t.roll?.terms) renderDice(t.roll.terms);
      }
    };
    renderDice(roll.terms);

    // Числовые модификаторы формулы
    if (numericMods.length) {
      const total = numericMods.reduce((a, b) => a + b, 0);
      if (total !== 0) {
        lines.push(`<div class="kk9-dsep"></div>`);
        lines.push(
          `<div class="kk9-drow kk9-dbonus">` +
          `<span class="kk9-dlabel">мод.</span>` +
          `<span class="kk9-dvals">${total > 0 ? "+" : ""}${total}</span>` +
          `</div>`
        );
      }
    }

    // Причины бонусов
    if (modReasons.length) {
      lines.push(`<div class="kk9-dsep"></div>`);
      for (const r of modReasons) {
        lines.push(
          `<div class="kk9-drow kk9-dreason">` +
          `<span class="kk9-dvals">→ ${r}</span>` +
          `</div>`
        );
      }
    }

    // Итог
    lines.push(`<div class="kk9-dsep"></div>`);
    const displayTotal = overrideTotal !== null ? overrideTotal : roll.total;
    lines.push(
      `<div class="kk9-drow kk9-dtotal">` +
      `<span class="kk9-dlabel">итог</span>` +
      `<span class="kk9-dtotal-val">${displayTotal}</span>` +
      `</div>`
    );
    return lines.join("");
  }

  // ----------------------------------------------------------
  // Общий метод броска
  // ----------------------------------------------------------
  async _doRoll(baseFormula, label, { attrKey=null, extraMod=0, isToughness=false, reasons=[], skillItem=null, itemType=null, skillUuid=null, isInitiative=false } = {}) {
    let healthMod  = 0;
    let halfResult = false;
    const allReasons = [...reasons];

    if (attrKey) {
      const h = this._getHealthModForAttr(attrKey, isToughness);
      if (h.blocked) {
        ui.notifications.warn(`${this.name}: ${h.reasons.join(", ")} — бросок невозможен.`);
        return null;
      }
      healthMod  = h.mod;
      halfResult = h.halfResult;
      allReasons.push(...h.reasons);
    }

    // ── Статусные модификаторы ──────────────────────────────
    const rollCtx = {
      attributeKey: attrKey,
      itemType:     itemType     ?? null,
      skillUuid:    skillUuid    ?? (skillItem?.uuid ?? null),
      isToughness:  isToughness  ?? false,
      isInitiative: isInitiative ?? false,
    };
    const { collectStatusModifiers, consumeStatusCharges } = await import("./weapon-combat.mjs");
    const stMods = collectStatusModifiers(this, rollCtx);

    // Все reasons от статусов — добавляем в allReasons
    for (const r of stMods.reasons) {
      if (r.includes("доп.")) continue; // extraDie выводим отдельно ниже
      allReasons.push(r);
    }

    // Изменение грани куба
    let evalFormula = baseFormula;
    if (stMods.dieMod !== 0) {
      evalFormula = this._applyDieChange(baseFormula, stMods.dieMod);
    }

    // Числовой модификатор от статусов
    const totalMod = healthMod + extraMod + stMods.numericMod;
    const modStr   = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";

    // Модификатор успехов
    const successMod = stMods.successMod;

    // Основная формула — без extraDie
    const fullFormula = modStr
      ? `(${evalFormula})${modStr}`
      : evalFormula;

    const roll = new Roll(fullFormula);
    await roll.evaluate();

    // Дополнительные кубики от статусов — бросаем каждый отдельно, показываем в reasons
    let extraDieTotal = 0;
    for (const ed of (stMods.extraDice ?? [])) {
      const sign      = ed.mode === "add" ? 1 : -1;
      const extraRoll = new Roll(`1d${ed.faces}`);
      await extraRoll.evaluate();
      extraDieTotal += sign * extraRoll.total;
      const signStr  = sign > 0 ? `+1d${ed.faces} = +${extraRoll.total}` : `-1d${ed.faces} = −${extraRoll.total}`;
      allReasons.push(`${ed.name ?? "Статус"}: ${signStr}`);
    }

    const rollTotal  = roll.total + extraDieTotal;
    const baseTotal  = rollTotal;
    const degree     = this._getSuccessDegreeFromTotal(baseTotal, halfResult, roll);

    // successMod — модификатор к числу успехов, применяем после вычисления
    if (successMod !== 0 && degree.type === "success") {
      degree.successes = Math.max(0, degree.successes + successMod);
      const s = degree.successes;
      degree.label = s === 1 ? "1 успех" : s <= 4 ? `${s} успеха` : `${s} успехов`;
    }

    const finalTotal = baseTotal;
    const diceHtml   = this._buildDiceHtml(roll, allReasons, finalTotal);
    const content    = this._buildRollMessage(label, degree, diceHtml, allReasons);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });

    // Срабатывание статусов категории 1 и 2 при броске
    try {
      const { triggerStatusEffectsOnRoll } = await import("./weapon-combat.mjs");
      await triggerStatusEffectsOnRoll(this);
    } catch(e) { console.warn("KK9: triggerStatusEffectsOnRoll", e); }

    // Расходуем заряды статусов (roll_modifier charges)
    if (stMods.usedIds.length) await consumeStatusCharges(this, stMods.usedIds);

    return { roll, degree };
  }


  // ----------------------------------------------------------
  // Применить сдвиг грани куба к формуле броска
  // Сдвигает каждый кубик в формуле на N шагов по шкале
  // d4 → d6 → d8 → d10 → d12 → d20 → d100
  // ----------------------------------------------------------
  _applyDieChange(formula, steps) {
    const SCALE = [4, 6, 8, 10, 12, 20, 100];
    return formula.replace(/d(\d+)/g, (match, faces) => {
      const n   = parseInt(faces);
      const idx = SCALE.indexOf(n);
      if (idx === -1) return match; // нестандартный куб — не трогаем
      const newIdx = Math.max(0, Math.min(SCALE.length - 1, idx + steps));
      return `d${SCALE[newIdx]}`;
    });
  }

  // ----------------------------------------------------------
  // Применить бонус артефакта с учётом состояния
  // perfect: бонус × 1.5, округление вниз (floor) — +4→+6, -4→-6
  // normal:  бонус × 1.0
  // worn:    бонус × 0.5, округление вниз (floor) — +3→+1, -3→-2
  // inactive/broken: 0
  // ----------------------------------------------------------
  _calcArtifactBonus(rawBonus, buffTier) {
    if (!rawBonus || !buffTier || buffTier === "broken" || buffTier === "inactive" || buffTier === "none") return 0;
    if (buffTier === "worn")    return Math.floor(rawBonus * 0.5);
    if (buffTier === "perfect") return Math.floor(rawBonus * 1.5);
    return rawBonus; // normal (good condition)
  }

  // ----------------------------------------------------------
  // АТРИБУТЫ
  // ----------------------------------------------------------
  // Получить linked items по ref-полю (artifact_refs, daemon_refs и т.д.)
  // ----------------------------------------------------------
  getLinkedItems(refField) {
    const refs = this.system[refField] || [];
    return refs.map(uuid => fromUuidSync(uuid)).filter(Boolean);
  }

  // ----------------------------------------------------------
  async rollAttribute(attributeName, modifier = 0) {
    const attr = this.system.attributes?.[attributeName];
    if (!attr) return;
    const die = attr.die;
    const labels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
    // Бонус от экипированных артефактов к атрибуту
    let artifactBonus = 0;
    const artifactReasons = [];
    for (const eq of this.getLinkedItems("artifact_refs")) {
      const cond = this._getItemConditionMod(eq);
      if (cond.blocked || !cond.buffActive) continue;
      const raw = eq.system.bonuses?.[attributeName] ?? 0;
      const b   = this._calcArtifactBonus(raw, cond.buffTier);
      if (b !== 0) {
        artifactBonus += b;
        artifactReasons.push(`${eq.name}: ${b > 0 ? "+" : ""}${b}`);
      }
    }
    const attrMod = (attr.modifier || 0) + modifier;
    const mod     = attrMod + artifactBonus;
    const modStr  = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC    = this.type === "character";
    // Добавляем модификатор атрибута в reasons если не ноль
    if (attrMod !== 0) artifactReasons.unshift(`модификатор: ${attrMod > 0 ? "+" : ""}${attrMod}`);
    return this._doRoll(this._rollFormula(die, modStr, isWC), labels[attributeName] || attributeName, {
      attrKey: attributeName,
      reasons: artifactReasons
    });
  }

  // ----------------------------------------------------------
  // НАВЫКИ — по ключу (базовые)
  // ----------------------------------------------------------
  async rollSkill(skillName, modifier = 0) {
    const skillLabels = {
      athletics:"Атлетика", notice:"Внимание", stealth:"Скрытность",
      persuasion:"Убеждение", fighting:"Рукопашный бой", deception:"Обман",
      navigation:"Ориентирование", memory:"Память", knowledge:"Знания",
      intimidation:"Запугивание", survival:"Выживание", driving:"Вождение"
    };
    let skill = this.system.skills?.[skillName];
    let label = skillLabels[skillName] || skillName;
    if (!skill) {
      const cs = this.system.customSkills?.find(s => s.name === skillName);
      if (cs) { skill = cs; label = cs.name; }
    }
    if (!skill) { ui.notifications.warn(`Навык "${skillName}" не найден.`); return; }
    const die    = skill.die;
    const mod    = (skill.modifier || 0) + modifier;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC   = this.type === "character";
    return this._doRoll(this._rollFormula(die, modStr, isWC), label, {
      attrKey: skill.linkedAttribute || null
    });
  }

  // ----------------------------------------------------------
  // НАВЫКИ / СПОСОБНОСТИ — по ID предмета
  // ----------------------------------------------------------
  async rollSkillItem(itemId) {
    const item = this.items.get(itemId);
    if (!item) { ui.notifications.warn("Навык не найден."); return; }

    // Skill и Ability не имеют condition — проверять нечего
    let die = item.system.die || 4;
    const baseMod = item.system.modifier || 0;

    // Правило КК9: навык/способность не может иметь куб выше привязанного атрибута
    const linkedAttr = item.system.linkedAttribute;
    if (linkedAttr) {
      const attrData = this.system.attributes?.[linkedAttr];
      if (!attrData) {
        ui.notifications.warn(
          `${this.name}: атрибут «${linkedAttr}» не найден — бросок невозможен.`
        );
        return null;
      }
      const attrDie = attrData.die || 4;
      if (die > attrDie) {
        ui.notifications.warn(
          `${item.name}: куб d${die} превышает атрибут d${attrDie}. Используется d${attrDie}.`
        );
        die = attrDie;
      }
    }

    // Дополнительный бонус от экипированных артефактов/устройств к этому конкретному навыку
    let itemBonus = 0;
    const reasons = [];
    // Собственный модификатор способности
    if (baseMod !== 0) reasons.push(`модификатор: ${baseMod > 0 ? "+" : ""}${baseMod}`);
    // Артефакты — из linked refs; девайсы — embedded
    const allEquipForSkill = [
      ...this.getLinkedItems("artifact_refs"),
      ...this.items.filter(i => i.type === "device")
    ];
    for (const eq of allEquipForSkill) {
      if (eq.system?.equipped !== "equipped") continue;
      const cond = this._getItemConditionMod(eq);
      if (cond.blocked) continue;

      // Артефакт: skill_bonuses — массив { item_uuid, item_name, bonus }
      if (eq.type === "artifact" && Array.isArray(eq.system.skill_bonuses)) {
        const artCond = this._getItemConditionMod(eq);
        if (!artCond.blocked && artCond.buffActive) {
          for (const sb of eq.system.skill_bonuses) {
            // UUID матч: прямой, по короткому ID, или по имени (world/compendium item vs embedded)
            const targetId   = sb.item_uuid?.split(".").pop();
            const nameMatch  = sb.item_name && sb.item_name === item.name;
            const uuidMatch  = sb.item_uuid === item.uuid || targetId === item.id;
            if (uuidMatch || nameMatch) {
              const b = this._calcArtifactBonus(sb.bonus, artCond.buffTier);
              if (b !== 0) {
                itemBonus += b;
                reasons.push(`${eq.name}: ${b > 0 ? "+" : ""}${b}`);
              }
            }
          }
        }
      }
      // Device: bonus_skill_uuid + bonus_value
      if (eq.type === "device" && eq.system.bonus_skill_uuid) {
        const devCond = this._getItemConditionMod(eq);
        if (!devCond.blocked && eq.system.equipped) {
          const targetId = eq.system.bonus_skill_uuid?.split(".").pop();
          if (eq.system.bonus_skill_uuid === item.uuid || targetId === item.id) {
            const rawB = eq.system.bonus_value || 0;
            const mult = devCond.buffMult ?? 1;
            const b    = Math.trunc(rawB * mult);
            if (b !== 0) {
              itemBonus += b;
              reasons.push(`${eq.name}: ${b > 0 ? "+" : ""}${b}`);
            }
          }
        }
      }
    }

    // Бонус от артефакта к linkedAttribute
    let attrArtifactBonus = 0;
    if (linkedAttr) {
      for (const eq of this.getLinkedItems("artifact_refs")) {
        const artCond = this._getItemConditionMod(eq);
        if (artCond.blocked || !artCond.buffActive) continue;
        const raw = eq.system.bonuses?.[linkedAttr] ?? 0;
        const b   = this._calcArtifactBonus(raw, artCond.buffTier);
        if (b !== 0) {
          attrArtifactBonus += b;
          reasons.push(`${eq.name} (атр.): ${b > 0 ? "+" : ""}${b}`);
        }
      }
    }

    const totalMod = baseMod + itemBonus + attrArtifactBonus;
    const modStr   = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWC     = this.type === "character";

    return this._doRoll(this._rollFormula(die, modStr, isWC), item.name, {
      attrKey:   item.system.linkedAttribute || null,
      skillUuid: item.uuid,
      reasons
    });
  }

  async rollAbility(itemId) {
    const result = await this.rollSkillItem(itemId);
    if (!result) return result;

    // Способность "Медитация" — восстанавливаем энергию по числу успехов
    const item = this.items.get(itemId);
    if (item?.name === "Медитация" && result.degree?.successes > 0) {
      const cur    = this.system.energy?.value ?? 0;
      const max    = this.system.energy?.max   ?? 0;

      // Модификатор восстановления от статусов (energy.mode = "roll_mod")
      const energyRollMod = this.items
        .filter(i => i.type === "status")
        .flatMap(i => i.system.effects ?? [])
        .filter(e => e.enabled && e.type === "energy" && e.energy?.mode === "roll_mod")
        .reduce((sum, e) => sum + (e.energy.roll_modifier ?? 0), 0);

      const successes = Math.max(0, result.degree.successes + energyRollMod);
      const newVal    = Math.min(cur + successes, max);
      if (newVal > cur) await this.update({ "system.energy.value": newVal });

      if (energyRollMod !== 0) {
        const sign = energyRollMod > 0 ? `+${energyRollMod}` : `${energyRollMod}`;
        ChatMessage.create({
          content: `<div class="kk9-chat-roll" style="--accent:#a855f7">
            <div class="kk9-chat-header"><div class="kk9-chat-header-text" style="padding:5px 10px">
              <span class="kk9-chat-name">${this.name}</span>
              <span class="kk9-chat-label">Медитация · ${sign} от статуса · восстановлено ${newVal - cur} ед.</span>
            </div></div>
          </div>`,
          speaker: ChatMessage.getSpeaker({ actor: this }),
          flags: { kk9: { isRoll: true } }
        });
      }
    }

    return result;
  }

  // ----------------------------------------------------------
  // ИНИЦИАТИВА
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // ИНИЦИАТИВА — главный диспатчер (вызывается из combat tracker и листа)
  // ----------------------------------------------------------
  async rollInitiative(options = {}) {
    switch (this.type) {
      case "character":
        return this.rollCharacterInitiative();
      case "npc-light":
      case "npc-hard":
      case "npc-boss":
        return this.rollNpcInitiative();
      case "container":
        return this.rollContainerInitiative();
      case "daemon":
        // Даймон-актор: инициатива через sheet, здесь только для combat tracker
        if (this.system.is_orb) return;
        return this.rollDaemonInitiative();
      case "companion":
        return this.rollCompanionInitiative();
      default:
        return super.rollInitiative(options);
    }
  }

  async rollDaemonInitiative() {
    const attrs  = this.system.attributes || {};
    const agDie  = attrs.agility?.die || 6;
    const smDie  = attrs.smarts?.die  || 6;
    const mod    = (attrs.agility?.modifier||0) + (attrs.smarts?.modifier||0);
    const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
    const roll   = new Roll(`1d${agDie}x + 1d${smDie}x${modStr}`);
    await roll.evaluate();
    const total  = roll.total;
    const combat = game?.combat;
    if (combat) {
      const cb = combat.combatants.find(c => c.actorId === this.id);
      if (cb) await cb.update({ initiative: total });
    }
    return { roll, total };
  }

  async rollCompanionInitiative() {
    const attrs  = this.system.attributes || {};
    const agDie  = attrs.agility?.die || 6;
    const smDie  = attrs.smarts?.die  || 6;
    const mod    = (attrs.agility?.modifier||0) + (attrs.smarts?.modifier||0);
    const modStr = mod ? (mod>0?`+${mod}`:`${mod}`) : "";
    const roll   = new Roll(`1d${agDie}x + 1d${smDie}x${modStr}`);
    await roll.evaluate();
    const total  = roll.total;
    const combat = game?.combat;
    if (combat) {
      const cb = combat.combatants.find(c => c.actorId === this.id);
      if (cb) await cb.update({ initiative: total });
    }
    return { roll, total };
  }

  async rollCharacterInitiative() {
    const ag   = this.system.attributes.agility;
    const sm   = this.system.attributes.smarts;

    const hAg = this._getHealthModForAttr("agility");
    const hSm = this._getHealthModForAttr("smarts");
    if (hAg.blocked || hSm.blocked) {
      ui.notifications.warn(`${this.name}: инициатива невозможна.`); return;
    }

    const mAg = ag.modifier + hAg.mod;
    const mSm = sm.modifier + hSm.mod;
    let mTotal = mAg + mSm;
    const reasons = [...hAg.reasons, ...hSm.reasons];

    // ── Статусные модификаторы для инициативы ──
    const { collectStatusModifiers, consumeStatusCharges } = await import("./weapon-combat.mjs");
    const stMods = collectStatusModifiers(this, { isInitiative: true, attributeKey: null });
    mTotal += stMods.numericMod;
    // Инициатива — успехи не применяются, исключаем усп. из reasons
    if (stMods.reasons.length) reasons.push(...stMods.reasons.filter(r => !r.includes("усп.")));

    const sMod = mTotal !== 0 ? (mTotal > 0 ? `+${mTotal}` : `${mTotal}`) : "";

    // Применяем сдвиг граней если есть
    let agDie = ag.die, smDie = sm.die;
    if (stMods.dieMod !== 0) {
      agDie = this._applyDieChange(`d${agDie}`, stMods.dieMod).replace("d","");
      smDie = this._applyDieChange(`d${smDie}`, stMods.dieMod).replace("d","");
      agDie = parseInt(agDie); smDie = parseInt(smDie);
    }

    // Wild Card: берём два лучших из трёх кубиков
    const formula = `{1d${agDie}x, 1d${smDie}x, 1d6x}kh2${sMod}`;

    const roll = new Roll(formula);
    await roll.evaluate();
    let total = roll.total;
    const diceHtml = this._buildDiceHtml(roll, reasons);
    const content  = this._buildInitiativeMessage("Инициатива", total, diceHtml);

    const combat = game?.combat;
    if (combat) {
      const combatant = combat.combatants.find(c => c.actorId === this.id);
      if (combatant) await combatant.update({ initiative: total });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });

    if (stMods.usedIds.length) await consumeStatusCharges(this, stMods.usedIds);
    return { roll, total };
  }

  // Инициатива контейнера — берёт первого доступного даймона/спутника (акторы)
  async rollContainerInitiative() {
    const refs = [...(this.system.daemon_refs || []), ...(this.system.companion_refs || [])];
    const items = [];
    for (const uuid of refs) {
      const doc = await fromUuid(uuid);
      // daemon-актор: пропускаем шарики
      if (doc?.system?.attributes && !(doc.system.is_orb === true)) { items.push(doc); break; }
    }
    if (!items.length) {
      ui.notifications.warn(`${this.name}: нет доступных даймонов или спутников для инициативы.`);
      return;
    }

    const item   = items[0];
    const attrs  = item.system.attributes;
    const agDie  = attrs.agility?.die      || 6;
    const smDie  = attrs.smarts?.die       || 6;
    const mod    = (attrs.agility?.modifier || 0) + (attrs.smarts?.modifier || 0);
    const modStr = mod ? (mod > 0 ? `+${mod}` : `${mod}`) : "";

    const roll = new Roll(`1d${agDie}x + 1d${smDie}x${modStr}`);
    await roll.evaluate();
    const total = roll.total;

    const portrait = item.img || "icons/svg/mystery-man.svg";
    let diceRows = "";
    for (const term of roll.terms) {
      if (typeof term.faces !== "number") continue;
      const vals = (term.results ?? []).map(rv => `<span class="kk9-rv dk">${rv.result}</span>`).join("");
      const sum  = (term.results ?? []).reduce((a, v) => a + v.result, 0);
      diceRows += `<div class="kk9-drow kept"><span class="kk9-dlabel">d${term.faces}</span><span class="kk9-dvals">${vals}</span><span class="kk9-dsum">= ${sum}</span></div>`;
    }
    if (mod) diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">мод.: ${modStr}</span></div>`;
    diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div>`;

    const content = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${item.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${item.name}</span><span class="kk9-chat-label">Инициатива</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-initiative"><span class="kk9-result-text">${total}</span></summary><div class="kk9-dice-body">${diceRows}</div></details></div>`;

    const combat = game?.combat;
    if (combat) {
      const combatant = combat.combatants.find(cb => cb.actorId === this.id);
      if (combatant) await combatant.update({ initiative: total });
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });
    return { roll, total };
  }

  // Инициатива контейнера с конкретным item (вызывается из листа с select)
  async rollContainerInitiativeForItem(item) {
    const attrs  = item.system.attributes;
    const agDie  = attrs.agility?.die      || 6;
    const smDie  = attrs.smarts?.die       || 6;
    const mod    = (attrs.agility?.modifier || 0) + (attrs.smarts?.modifier || 0);
    const modStr = mod ? (mod > 0 ? `+${mod}` : `${mod}`) : "";

    const roll = new Roll(`1d${agDie}x + 1d${smDie}x${modStr}`);
    await roll.evaluate();
    const total = roll.total;

    const portrait = item.img || "icons/svg/mystery-man.svg";
    let diceRows = "";
    for (const term of roll.terms) {
      if (typeof term.faces !== "number") continue;
      const vals = (term.results ?? []).map(rv => `<span class="kk9-rv dk">${rv.result}</span>`).join("");
      const sum  = (term.results ?? []).reduce((a, v) => a + v.result, 0);
      diceRows += `<div class="kk9-drow kept"><span class="kk9-dlabel">d${term.faces}</span><span class="kk9-dvals">${vals}</span><span class="kk9-dsum">= ${sum}</span></div>`;
    }
    if (mod) diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dreason"><span class="kk9-dvals">мод.: ${modStr}</span></div>`;
    diceRows += `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${total}</span></div>`;

    const content = `<div class="kk9-chat-roll" style="--accent:#c4a44a"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${portrait}" alt="${item.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:#c4a44a">${item.name}</span><span class="kk9-chat-label">Инициатива</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-initiative"><span class="kk9-result-text">${total}</span></summary><div class="kk9-dice-body">${diceRows}</div></details></div>`;

    const combat = game?.combat;
    if (combat) {
      // Ищем combatant по id актора-даймона/спутника (они теперь акторы)
      const cbByItem = combat.combatants.find(cb => cb.actorId === item.id);
      const cbByContainer = combat.combatants.find(cb => cb.actorId === this.id);
      const combatant = cbByItem || cbByContainer;
      if (combatant) await combatant.update({ initiative: total });
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: item }),
      content,
      flags: { kk9: { isRoll: true, actorId: item.id } }
    });
    return { roll, total };
  }
  // ----------------------------------------------------------
  async rollToughness() {
    const resistNames = ["Сопротивление боли","Сопротивление магии","Сопротивление ментальному давлению","Самоконтроль","Выживание"];
    const available   = this.items.filter(i =>
      i.type === "ability" && resistNames.includes(i.name)
    );
    const options = available.map(s =>
      `<option value="${s.id}|${s.system.die||4}">${s.name} (d${s.system.die||4})</option>`
    ).join("");

    let result = null;
    try {
      result = await Dialog.prompt({
        title: "Бросок Стойкости",
        content: `<div style="padding:8px">
          <p style="margin-bottom:8px">Дух${available.length ? " + навык сопротивления" : ""}</p>
          ${available.length
            ? `<select id="resist-skill" style="width:100%">
                 <option value="">— только Дух —</option>${options}
               </select>`
            : "<em>Нет доступных навыков сопротивления</em>"}
        </div>`,
        label: "Бросить",
        callback: html => html.find("#resist-skill").val() || null
      });
    } catch(e) { return; }

    const spiritDie = this.system.attributes.spirit.die;
    const spiritMod = this.system.attributes.spirit.modifier || 0;
    const isWC      = this.type === "character";

    // Стойкость — isToughness:true → не блокируется пипом 5
    const h      = this._getHealthModForAttr("spirit", true);
    const reasons = [...h.reasons];

    // ── Статусные модификаторы для стойкости ──
    const { collectStatusModifiers, consumeStatusCharges } = await import("./weapon-combat.mjs");
    const skillUuid = result ? (this.items.get(result.split("|")[0])?.uuid ?? null) : null;
    const stMods = collectStatusModifiers(this, {
      attributeKey: "spirit",
      isToughness:  true,
      skillUuid,
    });
    if (stMods.reasons.length) {
      for (const r of stMods.reasons) {
        if (r.includes("доп.")) continue; // extraDie выводим отдельно ниже
        reasons.push(r);
      }
    }

    // Применяем сдвиг грани к духу
    let effSpiritDie = spiritDie;
    if (stMods.dieMod !== 0) {
      effSpiritDie = parseInt(this._applyDieChange(`d${spiritDie}`, stMods.dieMod).replace("d",""));
    }

    const mod    = spiritMod + h.mod + stMods.numericMod;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";

    let formula, labelExtra = "";
    if (result) {
      const [itemId, skillDie] = result.split("|");
      const skillItem = this.items.get(itemId);
      labelExtra = skillItem ? ` + ${skillItem.name}` : "";
      // Применяем сдвиг и к навыку стойкости если есть
      let effSkillDie = parseInt(skillDie);
      if (stMods.dieMod !== 0) {
        effSkillDie = parseInt(this._applyDieChange(`d${effSkillDie}`, stMods.dieMod).replace("d",""));
      }
      const skillMod  = (skillItem?.system?.modifier || 0) + h.mod + stMods.numericMod;
      const mTotal    = mod + skillMod;
      const totalStr  = mTotal !== 0 ? (mTotal > 0 ? `+${mTotal}` : `${mTotal}`) : "";
      formula = isWC
        ? `{1d${effSpiritDie}x, 1d${effSkillDie}x, 1d6x}kh2${totalStr}`
        : `1d${effSpiritDie}x${modStr} + 1d${effSkillDie}x${skillMod !== 0 ? (skillMod > 0 ? "+" + skillMod : skillMod) : ""}`;
    } else {
      formula = isWC ? `{1d${effSpiritDie}x, 1d6x}kh${modStr}` : `1d${effSpiritDie}x${modStr}`;
    }

    const roll = new Roll(formula);
    await roll.evaluate();

    // Доп. кубики от статусов — бросаем каждый отдельно, показываем в reasons
    let extraDieTotal = 0;
    for (const ed of (stMods.extraDice ?? [])) {
      const sign      = ed.mode === "add" ? 1 : -1;
      const extraRoll = new Roll(`1d${ed.faces}`);
      await extraRoll.evaluate();
      extraDieTotal += sign * extraRoll.total;
      const signStr  = sign > 0 ? `+1d${ed.faces} = +${extraRoll.total}` : `-1d${ed.faces} = −${extraRoll.total}`;
      reasons.push(`${ed.name ?? "Статус"}: ${signStr}`);
    }

    // successMod + extraDie применяем к итогу
    const finalTotal = roll.total + extraDieTotal;
    const degree     = this._getSuccessDegreeFromTotal(finalTotal, h.halfResult);
    if (stMods.successMod !== 0 && degree.type === "success") {
      degree.successes = Math.max(0, degree.successes + stMods.successMod);
      const s = degree.successes;
      degree.label = s === 1 ? "1 успех" : s <= 4 ? `${s} успеха` : `${s} успехов`;
    }
    const diceHtml   = this._buildDiceHtml(roll, reasons, finalTotal);
    const content    = this._buildRollMessage(`Стойкость${labelExtra}`, degree, diceHtml, reasons);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });

    if (stMods.usedIds.length) await consumeStatusCharges(this, stMods.usedIds);
    return { roll, degree };
  }

  // ----------------------------------------------------------
  // ЗАЧИСЛЕНИЕ НА ФАКУЛЬТЕТ
  // ----------------------------------------------------------
  async enrollInFaculty(facultyItemId) {
    const facultyItem = game.items.get(facultyItemId);
    if (!facultyItem || facultyItem.type !== "faculty") {
      ui.notifications.warn("Предмет не является факультетом."); return;
    }
    const fData = facultyItem.system;

    await this.update({
      "system.faculty":       fData.color_key  || this.system.faculty,
      "system.faculty_color": fData.color      || "",
      "system.faculty_key":   fData.color_key  || "",
      "system.faculty_name":  facultyItem.name || "",
    });

    const existingAbilities = this.items.filter(i => i.type === "ability");
    const teacherName = fData.teacher || "";

    if (teacherName) {
      const existing = this.system.relations?.find?.(r => r.name === teacherName);
      if (!existing) {
        const rels = [...(this.system.relations || [])];
        rels.push({ name: teacherName, status: "neutral", level: 0, notes: "Куратор факультета" });
        await this.update({ "system.relations": rels });
      }
    }

    for (const abilityRef of (fData.abilities || [])) {
      const existing = existingAbilities.find(a => a.name === abilityRef.name);
      if (existing) {
        if (existing.type === "ability")
          await existing.update({ "system.faculty_id": facultyItem.id });
        continue;
      }
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
        await Item.create({
          name: abilityRef.name, type: "ability",
          system: { category: abilityRef.category || "common", faculty_id: facultyItem.id, description: "" }
        }, { parent: this });
      }
    }

    const _enrollAccent  = fData.color || "#c4a44a";
    const _enrollPortrait = this.img || "icons/svg/mystery-man.svg";
    const _enrollText = teacherName
      ? `${this.name} зачислен на ${facultyItem.name}.<br><em style="opacity:0.7;font-size:0.9em">Куратор ${teacherName} добавлен в связи.</em>`
      : `${this.name} зачислен на ${facultyItem.name}.`;
    await ChatMessage.create({
      content: `<div class="kk9-chat-roll" data-result-type="success" style="--accent:${_enrollAccent}"><div class="kk9-chat-header"><img class="kk9-chat-portrait" src="${_enrollPortrait}" alt="${this.name}"><div class="kk9-chat-header-text"><span class="kk9-chat-name" style="color:${_enrollAccent}">${this.name}</span><span class="kk9-chat-label">Зачисление на факультет</span></div></div><details class="kk9-result-details"><summary class="kk9-result-summary kk9-result-success"><span class="kk9-result-text">${_enrollText}</span></summary></details></div>`,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });
  }

  // ============================================================
  // БРОСКИ НПС
  // ============================================================

  // Формула для НПС — без wildcard или с настраиваемым wild_die (босс)
  _npcRollFormula(die, modStr, isWC = false, wcDie = 6) {
    const mod = modStr ? ` ${modStr}` : "";
    return isWC
      ? `{1d${die}x, 1d${wcDie}x}kh${mod}`.trim()
      : `1d${die}x${mod}`.trim();
  }

  // Бросок атрибута НПС — все типы используют system.attributes
  async rollNpcAttribute(attributeName) {
    const isBoss = this.type === "npc-boss";
    const isWC   = isBoss;
    const wcDie  = isBoss ? (this.system.wild_die || 6) : 6;

    const attr = this.system.attributes?.[attributeName];
    if (!attr) { ui.notifications.warn(`Атрибут «${attributeName}» не найден.`); return; }

    const labels = { agility:"Ловкость", smarts:"Смекалка", spirit:"Дух", endurance:"Выносливость", magic:"Магия" };
    const label  = labels[attributeName] || attributeName;

    return this._doRoll(
      this._npcRollFormula(attr.die, "", isWC, wcDie),
      label,
      { attrKey: attributeName }
    );
  }

  // Бросок инициативы НПС
  async rollNpcInitiative() {
    const isBoss = this.type === "npc-boss";
    const isWC   = isBoss;
    const wcDie  = isBoss ? (this.system.wild_die || 6) : 6;

    let dieAgi    = this.system.attributes?.agility?.die  || 6;
    let dieSmarts = this.system.attributes?.smarts?.die   || 6;

    const modAgi    = this.system.attributes?.agility?.modifier  || 0;
    const modSmarts = this.system.attributes?.smarts?.modifier   || 0;
    let mTotal      = modAgi + modSmarts;

    // ── Статусные модификаторы для инициативы ──
    const { collectStatusModifiers, consumeStatusCharges } = await import("./weapon-combat.mjs");
    const stMods = collectStatusModifiers(this, { isInitiative: true, attributeKey: null });
    mTotal += stMods.numericMod;
    if (stMods.dieMod !== 0) {
      dieAgi    = parseInt(this._applyDieChange(`d${dieAgi}`,    stMods.dieMod).replace("d",""));
      dieSmarts = parseInt(this._applyDieChange(`d${dieSmarts}`, stMods.dieMod).replace("d",""));
    }
    const reasons = [...stMods.reasons.filter(r => !r.includes("усп."))];

    const modStr = mTotal !== 0 ? (mTotal > 0 ? `+${mTotal}` : `${mTotal}`) : "";
    const formula = isWC
      ? `{1d${dieAgi}x, 1d${dieSmarts}x, 1d${wcDie}x}kh2${modStr}`
      : `1d${dieAgi}x + 1d${dieSmarts}x${modStr}`;

    const roll = new Roll(formula);
    await roll.evaluate();
    let total   = roll.total;
    const diceHtml = this._buildDiceHtml(roll, reasons);
    const content  = this._buildInitiativeMessage("Инициатива", total, diceHtml);

    const combat = game?.combat;
    if (combat) {
      const combatant = combat.combatants.find(c => c.actorId === this.id);
      if (combatant) await combatant.update({ initiative: total });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: { kk9: { isRoll: true, actorId: this.id } }
    });
    if (stMods.usedIds.length) await consumeStatusCharges(this, stMods.usedIds);
    return { roll, total };
  }

  // Бросок стойкости НПС
  async rollNpcToughness() {
    const isBoss  = this.type === "npc-boss";
    const isWC    = isBoss;
    const wcDie   = isBoss ? (this.system.wild_die || 6) : 6;

    const spiritDie = this.system.attributes?.spirit?.die || 6;

    const resistNames = ["Сопротивление боли","Сопротивление магии","Сопротивление ментальному давлению","Самоконтроль","Выживание"];
    const available   = this.items.filter(i => i.type === "ability" && resistNames.includes(i.name));
    const options     = available.map(s =>
      `<option value="${s.id}|${s.system.die||4}">${s.name} (d${s.system.die||4})</option>`
    ).join("");

    let result = null;
    try {
      result = await Dialog.prompt({
        title: "Бросок Стойкости",
        content: `<div style="padding:8px">
          <p style="margin-bottom:8px">Дух${available.length ? " + навык сопротивления" : ""}</p>
          ${available.length
            ? `<select id="resist-skill" style="width:100%">
                 <option value="">— только Дух —</option>${options}
               </select>`
            : "<em>Нет доступных навыков сопротивления</em>"}
        </div>`,
        label: "Бросить",
        callback: html => html.find("#resist-skill").val() || null
      });
    } catch(e) { return; }

    const modStr = "";
    let formula, labelExtra = "";

    if (result) {
      const [itemId, skillDie] = result.split("|");
      const skillItem = this.items.get(itemId);
      labelExtra = skillItem ? ` + ${skillItem.name}` : "";
      formula = isWC
        ? `{1d${spiritDie}x, 1d${skillDie}x, 1d${wcDie}x}kh2`
        : `1d${spiritDie}x + 1d${skillDie}x`;
    } else {
      formula = isWC
        ? `{1d${spiritDie}x, 1d${wcDie}x}kh`
        : `1d${spiritDie}x`;
    }

    return this._doRoll(formula, `Стойкость${labelExtra}`, {
      attrKey:     "spirit",
      isToughness: true,
      skillUuid:   chosen ? available.find(s => s.id === chosen.split("|")[0])?.uuid ?? null : null,
    });
  }

  // Бросок способности/навыка НПС по item id
  async rollNpcSkill(itemId) {
    const item = this.items.get(itemId);
    if (!item) { ui.notifications.warn("Способность не найдена."); return; }

    const isBoss = this.type === "npc-boss";
    const isWC   = isBoss;
    const wcDie  = isBoss ? (this.system.wild_die || 6) : 6;
    const die    = item.system.die || 4;
    const mod    = item.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const formula = this._npcRollFormula(die, modStr, isWC, wcDie);
    return this._doRoll(formula, item.name, {
      attrKey:   item.system.linkedAttribute || null,
      skillUuid: item.uuid,
    });
  }

}

// ============================================================
// KK9Item
// ============================================================
export class KK9Item extends Item {

  async rollDamage() {
    const dmg = this.system.damage;
    if (!dmg) { ui.notifications.warn("Урон не задан."); return; }

    const actor = this.actor;
    if (actor) {
      const cond = actor._getItemConditionMod(this);
      if (cond.blocked) {
        ui.notifications.warn(`"${this.name}" сломано — бросать нельзя.`); return;
      }
    }

    const roll = new Roll(dmg);
    await roll.evaluate();

    const portrait  = actor?.img || "icons/svg/item-bag.svg";
    const nameColor = actor?._getFacultyColor?.() || "#c4a44a";
    const diceHtml  = actor ? actor._buildDiceHtml(roll) : "";

    const content = `
<div class="kk9-chat-roll kk9-chat-damage" style="--accent:#c0392b">
  ${actor ? `
  <div class="kk9-chat-header">
    <img class="kk9-chat-portrait" src="${portrait}" alt="${actor.name}">
    <div class="kk9-chat-header-text">
      <span class="kk9-chat-name">${actor.name}</span>
      <span class="kk9-chat-label">${this.name}</span>
    </div>
  </div>` : ""}
  <div class="kk9-chat-result-bar kk9-result-damage">
    <span class="kk9-result-icon">⚔</span>
    <span class="kk9-result-text">Урон: <strong>${roll.total}</strong></span>
  </div>
  ${diceHtml ? `
  <details class="kk9-dice-details">
    <summary class="kk9-dice-summary">формула: ${dmg}</summary>
    <div class="kk9-dice-body">${diceHtml}</div>
  </details>` : ""}
  ${actor ? `<div class="kk9-chat-actor-byline">${actor.name}</div>` : ""}
</div>`.trim();

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      flags: { kk9: { isRoll: true } }
    });
    return roll;
  }
}
