// ============================================================
// КК9 | weapon-combat.mjs v1.0
// Логика атаки, применения урона и статусов
// Подключить в kk9.mjs:
//   import { registerCombatHooks, rollWeaponAttack } from "./module/weapon-combat.mjs";
//   // в Hooks.once("init"): registerCombatHooks();
// ============================================================

// ── Константы ──────────────────────────────────────────────
const DAMAGE_LEVELS = { light: 1, heavy: 2, lethal: 3 };

const DAMAGE_LABELS = {
  light:  "Лёгкий (1 уровень)",
  heavy:  "Тяжёлый (2 уровня)",
  lethal: "Летальный (3 уровня)"
};

const FREQ_LABELS = {
  per_turn:   "раз в ход",
  per_combat: "раз в бой",
  per_hour:   "раз в час",
  per_day:    "раз в день",
  rare:       "редко"
};

const STATUS_ICONS = {
  poison: "☠", shock: "⚡", magic: "✦", bleed: "🩸", acid: "⚗"
};

// ── Применить урон к актору ─────────────────────────────────
export async function applyDamageToActor(actor, damageLevel, damageType, extraLevels = 0) {
  const levels  = (DAMAGE_LEVELS[damageLevel] || 1) + extraLevels;
  const track   = damageType === "mental"
    ? "system.health.mental.value"
    : "system.health.physical.value";
  const current = damageType === "mental"
    ? (actor.system.health?.mental?.value ?? 0)
    : (actor.system.health?.physical?.value ?? 0);
  const newVal  = Math.min(current + levels, 5);
  await actor.update({ [track]: newVal });
  return { levels, newVal };
}

// ── Применить урон заклинания с overflow между шкалами ──────
// Физ→ментал→overflow, ментал→физ→overflow. Overflow пишется в system.overflow_damage.
export async function applySpellDamageToActor(actor, damageLevel, damageType, extraLevels = 0) {
  const totalLevels = (DAMAGE_LEVELS[damageLevel] || 1) + extraLevels;
  const physCur = actor.system.health?.physical?.value ?? 0;
  const mentCur = actor.system.health?.mental?.value  ?? 0;
  const CAP = 5;
  let remaining = totalLevels;
  let newPhys = physCur;
  let newMent = mentCur;
  let overflow = 0;

  if (damageType === "physical") {
    const physSpace = CAP - newPhys;
    if (remaining <= physSpace) { newPhys += remaining; remaining = 0; }
    else {
      remaining -= physSpace; newPhys = CAP;
      const mentSpace = CAP - newMent;
      if (remaining <= mentSpace) { newMent += remaining; remaining = 0; }
      else { remaining -= mentSpace; newMent = CAP; overflow = remaining; }
    }
  } else {
    const mentSpace = CAP - newMent;
    if (remaining <= mentSpace) { newMent += remaining; remaining = 0; }
    else {
      remaining -= mentSpace; newMent = CAP;
      const physSpace = CAP - newPhys;
      if (remaining <= physSpace) { newPhys += remaining; remaining = 0; }
      else { remaining -= physSpace; newPhys = CAP; overflow = remaining; }
    }
  }

  const updateData = {
    "system.health.physical.value": newPhys,
    "system.health.mental.value":   newMent
  };
  if (overflow > 0) {
    updateData["system.overflow_damage"] = (actor.system.overflow_damage ?? 0) + overflow;
  }
  await actor.update(updateData);
  return { newPhys, newMent, overflow };
}

// ── Применить статус к актору ───────────────────────────────
export async function applyStatusToActor(actor, statusItem) {
  const statuses = foundry.utils.deepClone(actor.system.active_statuses || []);
  // Не дублируем один и тот же статус
  if (statuses.find(s => s.uuid === statusItem.uuid)) return;
  statuses.push({
    uuid:        statusItem.uuid,
    statusName:  statusItem.name,
    status_type: statusItem.system.status_type,
    damage:      statusItem.system.damage,
    damage_type: statusItem.system.damage_type,
    frequency:   statusItem.system.frequency,
    uses:        statusItem.system.uses
  });
  await actor.update({ "system.active_statuses": statuses });
}


// ── Собрать бонусы от buff-артефактов актора ────────────────
// Возвращает { totalBonus, reasons }
// Учитывает состояние артефакта через методы актора:
//   broken/inactive → 0, worn → ×0.5 (floor), perfect → ×1.5 (floor), normal → ×1.0
function collectArtifactBonuses(actor, skillItem, attrKey) {
  if (!actor) return { totalBonus: 0, reasons: [] };

  const reasons = [];
  let totalBonus = 0;

  // Получаем все UUID артефактов актора
  const artifactRefs = actor.system.artifact_refs || [];

  for (const uuid of artifactRefs) {
    const art = fromUuidSync(uuid);
    if (!art) continue;
    if (art.system.artifact_type !== "buff") continue;
    if (art.system.equipped !== "equipped") continue;
    if (!art.system.active) continue;

    // Получаем состояние через метод актора — он знает всю логику buffTier
    const cond = actor._getItemConditionMod(art);
    if (cond.blocked || !cond.buffActive) continue;

    // Бонус к атрибуту навыка — отдельная строка
    if (attrKey && art.system.bonuses?.[attrKey]) {
      const raw = art.system.bonuses[attrKey] || 0;
      const b   = actor._calcArtifactBonus(raw, cond.buffTier);
      if (b !== 0) {
        totalBonus += b;
        reasons.push(`${art.name} (атр.): ${b > 0 ? "+" : ""}${b}`);
      }
    }

    // Бонус к конкретному навыку — каждый отдельной строкой
    if (skillItem && art.system.skill_bonuses?.length) {
      for (const sb of art.system.skill_bonuses) {
        const sbItem = fromUuidSync(sb.item_uuid);
        if (!sbItem) continue;
        if (sbItem.name === skillItem.name && sbItem.type === skillItem.type) {
          const raw = sb.bonus || 0;
          const b   = actor._calcArtifactBonus(raw, cond.buffTier);
          if (b !== 0) {
            totalBonus += b;
            reasons.push(`${art.name} (нав.): ${b > 0 ? "+" : ""}${b}`);
          }
        }
      }
    }
  }

  return { totalBonus, reasons };
}

// ── Хелперы рендера чат-сообщения атаки ─────────────────────

// Получить wildcard die актора (character=d6, npc-boss=wild_die, остальные=null)
function getActorWcDie(actor) {
  if (!actor) return 6;
  if (actor.type === "character") return 6;
  if (actor.type === "npc-boss") return actor.system.wild_die ?? 6;
  return null;
}

// Системное сообщение в стиле системы (без хедера)
function _sysMsg(actorOrName, text, sub = "", accentColor = "#c4a44a") {
  const name = typeof actorOrName === "string" ? actorOrName : actorOrName?.name ?? "Система";
  const portrait = (typeof actorOrName === "object" ? actorOrName?.img : null) ?? "icons/svg/mystery-man.svg";
  const lines = [
    `<style>.kk9-combat-msg .message-header{display:none!important}</style>`,
    `<div class="kk9-chat-roll kk9-combat-msg" style="--accent:${accentColor}">`,
    `  <div class="kk9-chat-header">`,
    `    <img class="kk9-chat-portrait" src="${portrait}" alt="${name}">`,
    `    <div class="kk9-chat-header-text">`,
    `      <span class="kk9-chat-name">${name}</span>`,
    sub ? `      <span class="kk9-chat-label">${sub}</span>` : "",
    `    </div>`,
    `  </div>`,
    `  <div style="padding:8px 14px 10px;font-size:0.88em;color:rgba(255,255,255,0.7);">${text}</div>`,
    `</div>`
  ];
  return lines.filter(Boolean).join("\n");
}

// Степени успеха
function _atkSuccessDegree(total) {
  if (total < 6) return { type: "failure", label: "ПРОМАХ" };
  const s = 1 + Math.floor((total - 6) / 4);
  const label = s === 1 ? "1 УСПЕХ" : s <= 4 ? `${s} УСПЕХА` : `${s} УСПЕХОВ`;
  return { type: "success", label };
}

// HTML кубиков — точная копия логики из documents.mjs _buildDiceHtml
function _atkBuildDiceHtml(roll, modReasons = []) {
  const lines = [];

  const renderDiceTerms = (terms) => {
    for (const t of terms) {
      if (Array.isArray(t.rolls) && Array.isArray(t.results)) {
        // PoolTerm
        t.rolls.forEach((r, idx) => {
          const poolEntry   = t.results[idx] ?? {};
          const isDiscarded = poolEntry.active === false || poolEntry.discarded === true;
          const die = r.terms?.find(dt => typeof dt.faces === "number" && Array.isArray(dt.results));
          if (!die) return;
          const faces   = die.faces;
          const results = die.results ?? [];
          const rollStr = results.map(res => {
            const boom = res.exploded ? "💥" : "";
            return `<span class="kk9-rv ${isDiscarded ? "dr" : "dk"}">${boom}${res.result}</span>`;
          }).join('<span class="kk9-rplus">+</span>');
          const total = results.reduce((s, res) => s + res.result, 0);
          lines.push(
            `<div class="${isDiscarded ? "kk9-drow discarded" : "kk9-drow kept"}">` +
            `<span class="kk9-dlabel">d${faces}</span>` +
            `<span class="kk9-dvals">${rollStr}</span>` +
            (!isDiscarded ? `<span class="kk9-dsum">= ${total}</span>` : "") +
            `</div>`
          );
        });
      } else if (typeof t.faces === "number" && Array.isArray(t.results)) {
        // Обычный Die
        const faces   = t.faces;
        const results = t.results ?? [];
        const rollStr = results.map(res => {
          const boom = res.exploded ? "💥" : "";
          return `<span class="kk9-rv dk">${boom}${res.result}</span>`;
        }).join('<span class="kk9-rplus">+</span>');
        const total = results.reduce((s, res) => s + res.result, 0);
        lines.push(
          `<div class="kk9-drow kept">` +
          `<span class="kk9-dlabel">d${faces}</span>` +
          `<span class="kk9-dvals">${rollStr}</span>` +
          `<span class="kk9-dsum">= ${total}</span>` +
          `</div>`
        );
      } else if (Array.isArray(t.terms)) renderDiceTerms(t.terms);
      else if (t.roll?.terms) renderDiceTerms(t.roll.terms);
    }
  };
  renderDiceTerms(roll.terms);

  // Модификаторы
  if (modReasons.length) {
    lines.push(`<div class="kk9-dsep"></div>`);
    for (const r of modReasons) {
      lines.push(`<div class="kk9-drow kk9-dreason"><span class="kk9-dvals">→ ${r}</span></div>`);
    }
  }

  // Итог
  lines.push(`<div class="kk9-dsep"></div>`);
  lines.push(
    `<div class="kk9-drow kk9-dtotal">` +
    `<span class="kk9-dlabel">итог</span>` +
    `<span class="kk9-dtotal-val">${roll.total}</span>` +
    `</div>`
  );
  return lines.join("");
}

// Полное чат-сообщение атаки в стиле системы (details/summary = сворачивание)
function _atkBuildMessage(actor, itemName, degree, diceHtml, dmgInfo, damageHtml) {
  const portrait    = actor?.img ?? "icons/svg/mystery-man.svg";
  const actorName   = actor?.name ?? itemName;
  const summaryClass = degree.type === "success" ? "kk9-result-success" : "kk9-result-failure";

  const parts = [
    `<div class="kk9-chat-roll">`,
    `  <div class="kk9-chat-header">`,
    `    <img class="kk9-chat-portrait" src="${portrait}" alt="${actorName}">`,
    `    <div class="kk9-chat-header-text">`,
    `      <span class="kk9-chat-name">${actorName}</span>`,
    `      <span class="kk9-chat-label">${itemName}</span>`,
    `    </div>`,
    `  </div>`,
    `  <details class="kk9-result-details">`,
    `    <summary class="kk9-result-summary ${summaryClass}">`,
    `      <span class="kk9-result-text">${degree.label}</span>`,
    `      <span class="kk9-result-expand-hint">›</span>`,
    `    </summary>`,
    diceHtml ? `    <div class="kk9-dice-body">${diceHtml}</div>` : "",
    `  </details>`,
  ];

  // Инфо об уроне — мелко под details, всегда видно при успехе
  if (dmgInfo) {
    parts.push(`  <div style="font-size:0.78em;color:rgba(255,255,255,0.4);padding:4px 14px;font-style:italic">${dmgInfo}</div>`);
  }

  // Кнопки
  if (damageHtml) {
    parts.push(`  <div class="kk9-chat-roll-bar">${damageHtml}</div>`);
  }

  parts.push(`</div>`);
  return parts.filter(Boolean).join("\n");
}

// Кнопки урона — используем kk9-roll-btn из системы
function _atkDamageButtons(weaponItem, weapon, effectiveDamageLevel, extraDamagePip,
                            hasStatus, targetOptions, itemBroken, conditionNoArtifactDamage,
                            isGearOverride = false, isSpell = false) {
  const dmgLabel  = DAMAGE_LABELS[effectiveDamageLevel] || effectiveDamageLevel;
  const typeLabel = weapon.damage_type === "mental" ? "Ментальный" : "Физический";
  const isGear    = isGearOverride || weaponItem.type === "gear";
  const actorId   = weapon._actorId ?? "";

  if (itemBroken) {
    return `<span style="font-size:0.82em;color:rgba(255,255,255,0.35);font-style:italic">` +
           `Нет урона — ${weaponItem.type === "artifact" ? "артефакт" : "снаряжение"} сломано</span>`;
  }
  if (conditionNoArtifactDamage) {
    return `<span style="font-size:0.82em;color:rgba(255,255,255,0.35);font-style:italic">` +
           `Нет урона — плохое состояние (${weapon.condition_chance}% сработало)</span>`;
  }

  const baseData = [
    `data-weapon-id="${weaponItem.id}"`,
    `data-actor-id="${actorId}"`,
    `data-damage-level="${effectiveDamageLevel}"`,
    `data-damage-type="${weapon.damage_type}"`,
    `data-extra-pip="${extraDamagePip || 0}"`,
    `data-has-status="${hasStatus ? "1" : "0"}"`,
    `data-status-uuid="${weapon.status_uuid || ""}"`,
    `data-is-gear="${isGear ? "1" : "0"}"`,
    `data-is-spell="${isSpell ? "1" : "0"}"`,
  ].join(" ");

  const selectHtml = !isGear
    ? `<select id="kk9-target-select-${weaponItem.id}" style="flex:2;min-width:100px;background:var(--bg3,rgba(0,0,0,0.3));border:1px solid rgba(255,255,255,0.15);border-radius:3px;color:#b8b0a4;padding:2px 6px;font-size:0.78em;font-family:'Jost',sans-serif"><option value="">— выбери цель —</option>${targetOptions}</select>`
    : "";

  const applyBtn  = `<button class="kk9-apply-damage kk9-roll-btn" ${baseData}>Засчитать${extraDamagePip ? " +пип" : ""}${isGear ? " (все)" : ""}</button>`;
  const resistBtn = !isGear ? `<button class="kk9-resist-roll kk9-roll-btn" ${baseData}>Стойкость</button>` : "";
  const missBtn   = `<button class="kk9-miss kk9-roll-btn">Промах</button>`;

  return `${selectHtml}${applyBtn}${resistBtn}${missBtn}`;
}

// ── Бросок атаки оружием ────────────────────────────────────
export async function rollWeaponAttack(weaponItem, actor) {
  const weapon = weaponItem.system;

  // Найти навык — только у актора (embedded копия)
  // Если навык не найден у актора — используем attack_modifier артефакта/оружия
  let skillItem = null;
  if (weapon.skill_uuid && actor) {
    const worldItem = fromUuidSync(weapon.skill_uuid);
    skillItem = actor.items.find(i =>
      i.uuid === weapon.skill_uuid ||
      i.id === weapon.skill_uuid ||
      (worldItem && i.name === worldItem.name && i.type === worldItem.type)
    ) ?? null;
    // Намеренно НЕ падаем на worldItem — если нет у актора, идём в else → attack_modifier
  } else if (weapon.skill_uuid && !actor) {
    // Нет актора — берём мировой item напрямую (броски без персонажа)
    skillItem = fromUuidSync(weapon.skill_uuid) ?? null;
  }

  // Wildcard die актора
  const wcDie    = getActorWcDie(actor);
  const isWC     = wcDie !== null;
  const attackerName = actor?.name ?? weaponItem.name;

  // Формула броска
  let formula, skillLabel, skillDie;
  if (skillItem) {
    skillDie   = skillItem.system.die || 4;
    const mod  = skillItem.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    formula    = isWC ? `{1d${skillDie}${modStr}, 1d${wcDie}${modStr}}kh` : `1d${skillDie}${modStr}`;
    skillLabel = skillItem.name;
  } else {
    // Нет навыка у актора — ищем die в навыке на объекте (weapon.skill_uuid → мировой item)
    const worldSkill = weapon.skill_uuid ? fromUuidSync(weapon.skill_uuid) : null;
    skillDie = worldSkill?.system?.die ?? 4;
    // Берём attack_modifier с учётом состояния
    let rawMod = weapon.attack_modifier || 0;
    let finalMod = rawMod;
    if (rawMod !== 0 && actor) {
      if (weaponItem.type === "artifact") {
        const cond = actor._getItemConditionMod(weaponItem);
        finalMod = actor._calcArtifactBonus(rawMod, cond.buffTier);
      } else {
        const cond = weapon.condition ?? "good";
        if (cond === "broken")       finalMod = 0;
        else if (cond === "worn")    finalMod = Math.floor(rawMod * 0.5);
        else if (cond === "perfect") finalMod = Math.floor(rawMod * 1.5);
      }
    }
    const modStr = finalMod !== 0 ? (finalMod > 0 ? `+${finalMod}` : `${finalMod}`) : "";
    formula    = isWC ? `{1d${skillDie}${modStr}, 1d${wcDie}${modStr}}kh` : `1d${skillDie}${modStr}`;
    skillLabel = rawMod !== 0 ? `модификатор ${finalMod > 0 ? "+" : ""}${finalMod}` : "без навыка";
  }

  // ── Проверка состояния weapon/artifact на broken ──
  // broken → урон не засчитывается (кнопки не показываем)
  let itemBroken = false;
  if (weaponItem.type === "artifact") {
    // Для артефакта — проверяем через _getItemConditionMod актора
    const refs = actor ? (actor.system.artifact_refs || []) : [];
    for (const uuid of refs) {
      const art = fromUuidSync(uuid);
      if (!art) continue;
      if (art.system.artifact_type !== "attack") continue;
      if (art.system.equipped !== "equipped") continue;
      const cond = actor._getItemConditionMod(art);
      if (cond.blocked) { itemBroken = true; break; }
    }
  } else {
    // Для weapon/gear/device — берём condition прямо из item
    itemBroken = weapon.condition === "broken";
  }

  // ── Эффект состояния на урон ──
  // condition_chance — % шанс эффекта (для artifact и weapon)
  // perfect + прок → урон +1 уровень (lethal → lethal + extra pip)
  // worn    + прок → нет урона совсем
  let conditionDamageUpgrade = false;
  let conditionNoArtifactDamage = false;
  if (!itemBroken) {
    const chance = weapon.condition_chance || 0;
    const cond   = weapon.condition ?? "good";
    if (chance > 0) {
      const roll = Math.random() * 100;
      if (cond === "perfect" && roll < chance) conditionDamageUpgrade    = true;
      if (cond === "worn"    && roll < chance) conditionNoArtifactDamage = true;
    }
  }

  // ── Бонусы от buff-артефактов ──
  const attrKey = skillItem?.system?.linkedAttribute ?? null;
  const { totalBonus: artBonus, reasons: artReasons } = collectArtifactBonuses(actor, skillItem, attrKey);

  // Модификатор навыка уже в формуле — добавляем только артефактный бонус
  const finalFormula = artBonus !== 0
    ? `(${formula})${artBonus > 0 ? '+' : ''}${artBonus}`
    : formula;

  const modReasons = [];
  if (skillItem?.system?.modifier) {
    const m = skillItem.system.modifier;
    modReasons.push(`модификатор: ${m > 0 ? '+' : ''}${m}`);
  }
  modReasons.push(...artReasons);

  const roll = new Roll(finalFormula);
  await roll.evaluate();

  // Цвет сообщения по результату
  const total   = roll.total;
  const success = total >= 6;

  // Список акторов для выбора цели (все кроме атакующего)
  const targetOptions = game.actors
    .filter(a => a.id !== actor?.id && ["character","npc-light","npc-hard","npc-boss"].includes(a.type))
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join("");

  // Статус-инфо для кнопки
  const hasStatus  = weapon.has_status && weapon.status_uuid;
  const statusInfo = hasStatus
    ? `<span style="font-size:0.82em;color:#c084fc"> + статус: ${weapon.status_name || "?"}</span>`
    : "";

  // Эффективный уровень урона с учётом состояния артефакта
  const DAMAGE_ORDER = ["light", "heavy", "lethal"];
  const baseDamageLevel = weapon.damage_level || "light";
  let effectiveDamageLevel = baseDamageLevel;
  let extraDamagePip = false; // lethal + perfect прок → +1 пип

  if (conditionDamageUpgrade) {
    const idx = DAMAGE_ORDER.indexOf(baseDamageLevel);
    if (idx < DAMAGE_ORDER.length - 1) {
      effectiveDamageLevel = DAMAGE_ORDER[idx + 1];
    } else {
      // lethal → остаётся lethal + extra pip того же типа
      extraDamagePip = true;
    }
  }

  // Степени успеха
  const degree = _atkSuccessDegree(total);
  weapon._actorId = actor?.id ?? "";

  // Все модификаторы отдельными строками
  const allReasons = [];
  if (skillItem?.system?.modifier) {
    const m = skillItem.system.modifier;
    allReasons.push(`модификатор: ${m > 0 ? "+" : ""}${m}`);
  }
  allReasons.push(...artReasons);

  const diceHtml   = _atkBuildDiceHtml(roll, allReasons);
  const dmgInfo    = success
    ? `${DAMAGE_LABELS[effectiveDamageLevel] || effectiveDamageLevel} · ${weapon.damage_type === "mental" ? "Ментальный" : "Физический"}`
    : "";
  const damageHtml = success
    ? _atkDamageButtons(weaponItem, weapon, effectiveDamageLevel, extraDamagePip,
        hasStatus, targetOptions, itemBroken, conditionNoArtifactDamage)
    : `<div class="kk9-atk-nodmg">Атака не прошла.</div>`;

  const msgContent = _atkBuildMessage(actor, weaponItem.name, degree, diceHtml, dmgInfo, damageHtml);

  const msg = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: msgContent,
    flags: { kk9: { isRoll: true, actorId: actor?.id } }
  });

  return msg;
}

// ── Обработчики кнопок в чате ───────────────────────────────
export function registerChatListeners() {
  // Делегируем на document чтобы ловить динамически созданные сообщения
  $(document).on("click", ".kk9-apply-damage", async function() {
    await _handleApplyDamage($(this));
  });

  $(document).on("click", ".kk9-resist-roll", async function() {
    await _handleResistRoll($(this));
  });

  $(document).on("click", ".kk9-miss", function() {
    const $roll = $(this).closest(".kk9-chat-roll, .kk9-attack-msg, .message-content");
    $roll.find("select, button").prop("disabled", true).css("opacity", "0.4");
    $(this).closest(".kk9-chat-roll-bar").after(
      `<div style="font-size:0.78em;color:rgba(255,255,255,0.35);font-style:italic;padding:4px 14px">Промах — урон не засчитан.</div>`
    );
  });
}

async function _getTargetActor(btn) {
  const weaponId = btn.data("weapon-id");
  const $msg     = btn.closest(".kk9-chat-roll, .kk9-attack-msg, .message-content");
  const targetId = $msg.find(`#kk9-target-select-${weaponId}`).val();
  if (!targetId) { ui.notifications.warn("Выбери цель."); return null; }
  return game.actors.get(targetId);
}

// ── Диалог мультиселекта целей для gear/площадного заклинания ──
async function _showGearTargetDialog(damageLevel, damageType, extraPip, hasStatus, statusUuid, isSpell = false) {
  let candidates = [];
  const scene = game.scenes?.active;
  if (scene && scene.tokens.size > 0) {
    const seen = new Set();
    candidates = scene.tokens
      .filter(t => t.actor)
      .map(t => ({ id: t.actor.id, name: `${t.name} (сцена)` }))
      .filter(c => seen.has(c.id) ? false : seen.add(c.id));
  }
  if (candidates.length === 0) {
    candidates = game.actors
      .filter(a => ["character","npc-light","npc-hard","npc-boss"].includes(a.type))
      .map(a => ({ id: a.id, name: a.name }));
  }

  const rows = candidates.map(c => `
    <div class="kk9-gear-target-row" data-id="${c.id}" style="
      display:flex;align-items:center;gap:10px;padding:8px 12px;
      background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer;user-select:none;">
      <div class="kk9-gear-cb-box" style="
        width:16px;height:16px;flex-shrink:0;border:2px solid #4a4a4a;border-radius:3px;
        background:#1c1c1c;display:flex;align-items:center;justify-content:center;
        font-size:11px;color:transparent;transition:all 0.1s;">✓</div>
      <span style="font-family:'Jost',sans-serif;font-size:0.88em;color:#b8b0a4;flex:1">${c.name}</span>
      <input type="checkbox" name="target" value="${c.id}" style="display:none" />
    </div>`).join("");

  const dialogContent = `
    <style>
      .kk9-gear-target-row.selected { background:rgba(196,164,74,0.15)!important;border-color:#c4a44a!important; }
      .kk9-gear-target-row.selected .kk9-gear-cb-box { background:#c4a44a!important;border-color:#c4a44a!important;color:#1c1c1c!important; }
      .kk9-gear-target-row:not(.selected):hover { background:#313131!important;border-color:#4a4a4a!important; }
      .kk9-gear-list::-webkit-scrollbar { width:4px; }
      .kk9-gear-list::-webkit-scrollbar-thumb { background:#3a3a3a;border-radius:2px; }
    </style>
    <div style="background:#1c1c1c;padding:8px 4px 4px;margin:-8px -8px -4px">
      <p style="font-family:'Jost',sans-serif;font-size:0.73em;color:#6a6560;margin:0 8px 10px;letter-spacing:0.06em;text-transform:uppercase">
        Выбери всех кто получает урон
      </p>
      <div class="kk9-gear-list" style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;padding:0 8px 4px">
        ${rows}
      </div>
    </div>`;

  return new Promise(resolve => {
    new Dialog({
      title: isSpell ? "✦ Площадное заклинание" : "⚔ Площадная атака",
      content: dialogContent,
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Применить урон",
          callback: async html => {
            const selected = html.find("input[name=target]:checked").map((_, el) => el.value).get();
            if (!selected.length) { ui.notifications.warn("Выбери хотя бы одну цель."); resolve(false); return; }
            for (const actorId of selected) {
              const target = game.actors.get(actorId);
              if (!target) continue;
              let resultMsg = "";
              if (isSpell) {
                const { newPhys, newMent, overflow } = await applySpellDamageToActor(target, damageLevel, damageType, parseInt(extraPip) || 0);
                resultMsg = `Физ: ${newPhys}/5 · Мент: ${newMent}/5${overflow ? ` · Overflow: +${overflow}` : ""}`;
              } else {
                const { newVal } = await applyDamageToActor(target, damageLevel, damageType, parseInt(extraPip) || 0);
                resultMsg = `${damageType === "mental" ? "Ментальное" : "Физическое"} состояние: ${newVal}/5`;
              }
              if (hasStatus && statusUuid) {
                const statusItem = await fromUuid(statusUuid);
                if (statusItem) await applyStatusToActor(target, statusItem);
              }
              const gearDmgText = `${target.name} получает урон (площадная${isSpell ? " магия" : " атака"}).` +
                `<br><span style="font-size:0.85em;color:rgba(255,255,255,0.45)">${resultMsg}${hasStatus && statusUuid ? " · статус применён" : ""}</span>`;
              ChatMessage.create({
                content: _sysMsg(target, gearDmgText, "", isSpell ? "#a855f7" : "#c0392b"),
                flags: { kk9: { isCombatMsg: true } }
              });
            }
            resolve(true);
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Отмена", callback: () => resolve(false) }
      },
      default: "apply",
      render: html => {
        const $d = html.closest(".app.dialog");
        $d.css("background", "#1c1c1c");
        $d.find(".window-content").css("background", "#1c1c1c");
        $d.find(".dialog-button").css({ background:"#2a2a2a", border:"1px solid #3a3a3a", color:"#b8b0a4", fontFamily:"'Jost',sans-serif", fontSize:"0.85em" });
        $d.find(".dialog-button[data-button='apply']").css({ borderColor: isSpell ? "#a855f7" : "#c4a44a", color: isSpell ? "#a855f7" : "#c4a44a" });
        $d.find(".dialog-button").on("mouseenter", function() { $(this).css("background","#313131"); }).on("mouseleave", function() { $(this).css("background","#2a2a2a"); });
        html.find(".kk9-gear-target-row").on("click", function() {
          const $row = $(this), $cb = $row.find("input[type=checkbox]");
          const checked = !$cb.prop("checked");
          $cb.prop("checked", checked);
          $row.toggleClass("selected", checked);
        });
      }
    }, { width: 340, classes: ["dialog","kk9-dialog"] }).render(true);
  });
}

async function _handleApplyDamage(btn) {
  const isGear  = btn.data("is-gear")  === "1" || btn.data("is-gear")  === 1;
  const isSpell = btn.data("is-spell") === "1" || btn.data("is-spell") === 1;
  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const extraPip    = parseInt(btn.data("extra-pip")) || 0;
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");

  // Gear или площадное заклинание — GM-диалог
  if (isGear) {
    if (!game.user.isGM) { ui.notifications.info("Попроси мастера засчитать урон."); return; }
    const applied = await _showGearTargetDialog(damageLevel, damageType, extraPip, hasStatus, statusUuid, isSpell);
    if (applied) btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
    return;
  }

  // Обычная атака — одна цель
  const target = await _getTargetActor(btn);
  if (!target) return;

  let resultMsg = "";
  if (isSpell) {
    const { newPhys, newMent, overflow } = await applySpellDamageToActor(target, damageLevel, damageType, extraPip);
    resultMsg = `Физ: ${newPhys}/5 · Мент: ${newMent}/5${overflow ? ` · Overflow: +${overflow}` : ""}`;
  } else {
    const { newVal } = await applyDamageToActor(target, damageLevel, damageType, extraPip);
    resultMsg = `${damageType === "mental" ? "Ментальное" : "Физическое"} состояние: ${newVal}/5`;
  }

  if (hasStatus && statusUuid) {
    const statusItem = await fromUuid(statusUuid);
    if (statusItem) await applyStatusToActor(target, statusItem);
  }

  const dmgText = `${target.name} получает урон${isSpell ? " (заклинание)" : ""}.` +
    `<br><span style="font-size:0.85em;color:rgba(255,255,255,0.45)">${resultMsg}${hasStatus && statusUuid ? " · статус применён" : ""}</span>`;
  ChatMessage.create({
    content: _sysMsg(target, dmgText, "", isSpell ? "#a855f7" : "#c0392b"),
    flags: { kk9: { isCombatMsg: true } }
  });

  btn.closest(".kk9-chat-roll-bar, div").find("button, select").prop("disabled", true).css("opacity", "0.4");
}

async function _handleResistRoll(btn) {
  const target = await _getTargetActor(btn);
  if (!target) return;

  // Бросок стойкости цели
  const spiritDie = target.system.attributes?.spirit?.die || 4;
  const isWC = target.type === "character";
  const formula = isWC ? `{1d${spiritDie}, 1d6}kh` : `1d${spiritDie}`;
  const roll = new Roll(formula);
  await roll.evaluate();

  const success     = roll.total >= 6;
  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const extraPip    = btn.data("extra-pip") === "1" || btn.data("extra-pip") === 1;
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    flavor:  `${target.name} — Стойкость (сопротивление)`
  });

  if (!success) {
    const isSpellResist = btn.data("is-spell") === "1" || btn.data("is-spell") === 1;
    let resultMsg = "";
    if (isSpellResist) {
      const { newPhys, newMent, overflow } = await applySpellDamageToActor(target, damageLevel, damageType, parseInt(extraPip) || 0);
      resultMsg = `Физ: ${newPhys}/5 · Мент: ${newMent}/5${overflow ? ` · Overflow: +${overflow}` : ""}`;
    } else {
      const { newVal } = await applyDamageToActor(target, damageLevel, damageType, parseInt(extraPip) || 0);
      resultMsg = `${damageType === "mental" ? "Ментальное" : "Физическое"} состояние: ${newVal}/5`;
    }
    if (hasStatus && statusUuid) {
      const statusItem = await fromUuid(statusUuid);
      if (statusItem) await applyStatusToActor(target, statusItem);
    }
    const failText = `${target.name} провалил стойкость — урон засчитан.` +
      `<br><span style="font-size:0.85em;color:rgba(255,255,255,0.45)">${resultMsg}${hasStatus && statusUuid ? " · статус применён" : ""}</span>`;
    ChatMessage.create({
      content: _sysMsg(target, failText, "Стойкость", "#c0392b"),
      flags: { kk9: { isCombatMsg: true } }
    });
  } else {
    ChatMessage.create({
      content: _sysMsg(target, `${target.name} устоял — урон не засчитан.`, "Стойкость", "#4a7a5a"),
      flags: { kk9: { isCombatMsg: true } }
    });
  }

  btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
}

// ── Вычислить урон заклинания из стоимости ─────────────────
// is_aoe = true → пороги сдвинуты на +2 к каждому, +1 пип каждые 8 сверх 14
// is_aoe = false → обычные пороги, +1 пип каждые 6 сверх 12
function calcSpellDamage(cost, isAoe) {
  if (isAoe) {
    // 1-4 light, 5-8 heavy, 9-14 lethal, 15+ lethal+pips(каждые 8)
    if (cost <= 4)  return { level: "light",  pips: 0 };
    if (cost <= 8)  return { level: "heavy",  pips: 0 };
    if (cost <= 14) return { level: "lethal", pips: 0 };
    return { level: "lethal", pips: Math.floor((cost - 14) / 8) };
  } else {
    // 1-2 light, 3-6 heavy, 7-12 lethal, 13+ lethal+pips(каждые 6)
    if (cost <= 2)  return { level: "light",  pips: 0 };
    if (cost <= 6)  return { level: "heavy",  pips: 0 };
    if (cost <= 12) return { level: "lethal", pips: 0 };
    return { level: "lethal", pips: Math.floor((cost - 12) / 6) };
  }
}

// ── Бросок заклинания ────────────────────────────────────────
export async function rollSpellAttack(spellItem, actor) {
  const spell = spellItem.system;
  if (!actor) { ui.notifications.warn("Заклинание должно быть на карточке персонажа."); return; }

  // ── 1. Проверка палочки ──
  if (!spell.no_wand_needed) {
    const hasWand = (actor.system.artifact_refs || []).some(uuid => {
      const art = fromUuidSync(uuid);
      return art && art.system.artifact_type === "ring" && art.system.equipped === "equipped";
    });
    if (!hasWand) {
      ui.notifications.warn(`${spellItem.name}: требуется экипированная палочка-артефакт.`);
      return;
    }
  }

  // ── 2. Проверка и списание энергии ──
  const cost        = spell.cost || 0;
  const currentEnergy = actor.system.energy?.value ?? 0;
  const maxEnergy   = actor.system.energy?.max ?? 0;
  let   overcast    = false; // флаг превозмогания
  let   overcostPips = 0;   // сколько коста сверх запаса

  if (cost > currentEnergy) {
    // Не хватает энергии — диалог превозмогания
    const deficit = cost - currentEnergy;
    const proceed = await new Promise(resolve => {
      new Dialog({
        title: "⚡ Превозмогание",
        content: `
          <style>
            .kk9-overcast-wrap { background:#1c1c1c;padding:8px 4px 4px;margin:-8px -8px -4px;font-family:'Jost',sans-serif; }
            .kk9-overcast-wrap p { color:#b8b0a4;font-size:0.88em;margin:0 8px 10px; }
            .kk9-overcast-warn { color:#c0392b;font-size:0.82em;margin:0 8px 6px; }
          </style>
          <div class="kk9-overcast-wrap">
            <p>Не хватает <strong>${deficit}</strong> ед. энергии для <strong>${spellItem.name}</strong>.</p>
            <p class="kk9-overcast-warn">⚠ При превозмогании бросается Дух (≥6). Провал или успех — нехватка коста съедает пипы состояния.</p>
            <p>Продолжить?</p>
          </div>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-bolt"></i>',
            label: "Превозмочь",
            callback: () => resolve(true)
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Отмена",
            callback: () => resolve(false)
          }
        },
        default: "yes",
        render: html => {
          const $d = html.closest(".app.dialog");
          $d.css("background", "#1c1c1c");
          $d.find(".window-content").css("background", "#1c1c1c");
          $d.find(".dialog-button").css({ background:"#2a2a2a", border:"1px solid #3a3a3a", color:"#b8b0a4", fontFamily:"'Jost',sans-serif", fontSize:"0.85em" });
          $d.find(".dialog-button[data-button='yes']").css({ borderColor:"#c0392b", color:"#c0392b" });
        }
      }, { width: 340 }).render(true);
    });
    if (!proceed) return;

    overcast    = true;
    overcostPips = deficit; // сколько коста не хватило → уйдёт в пипы
    // Списываем всю оставшуюся энергию (до 0)
    await actor.update({ "system.energy.value": 0 });
  } else {
    // Хватает — просто списываем
    await actor.update({ "system.energy.value": currentEnergy - cost });
  }

  // ── 3. Если превозмогание — бросок духа ──
  let spellBlocked = false;
  if (overcast) {
    const spiritDie = actor.system.attributes?.spirit?.die || 4;
    const isWC = actor.type === "character";
    const formula = isWC ? `{1d${spiritDie}, 1d6}kh` : `1d${spiritDie}`;
    const spiritRoll = new Roll(formula);
    await spiritRoll.evaluate();
    // Бросок духа в стиле системы
    const spiritDegree = _atkSuccessDegree(spiritRoll.total);
    const spiritDiceHtml = _atkBuildDiceHtml(spiritRoll, []);
    const spiritContent = _atkBuildMessage(actor, "Дух (превозмогание)", spiritDegree, spiritDiceHtml, "", "");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: spiritContent,
      flags: { kk9: { isRoll: true, actorId: actor?.id } }
    });
    if (spiritRoll.total < 6) {
      spellBlocked = true; // провал — спелл не работает
    }
    // В любом случае применяем пипы от перерасхода (с overflow между шкалами)
    const { level: overcostLevel, pips: overcostPipCount } = calcSpellDamage(overcostPips, false);
    const damType = spell.damage_type || "physical";
    const { newPhys: op, newMent: om, overflow: oo } = await applySpellDamageToActor(actor, overcostLevel, damType, overcostPipCount);
    const overcostText = `Превозмогание — ${overcostPips} ед. перерасхода → ${DAMAGE_LABELS[overcostLevel]}${overcostPipCount ? ` +${overcostPipCount} пип` : ""} (${damType === "mental" ? "ментально" : "физически"})` +
      `<br><span style="font-size:0.85em;color:rgba(255,255,255,0.45)">Физ: ${op}/5 · Мент: ${om}/5${oo ? ` · Overflow: +${oo}` : ""}` +
      `${spellBlocked ? " · <span style=\"color:#c0392b\">Провал духа</span>" : ""}</span>`;
    ChatMessage.create({
      content: _sysMsg(actor, overcostText, "Дух (превозмогание)", "#a855f7"),
      flags: { kk9: { isCombatMsg: true } }
    });
    if (spellBlocked) return;
  }

  // ── 4. Вычисляем урон из cost ──
  const isAoe = spell.is_aoe || false;
  const { level: damageLevel, pips: extraPips } = calcSpellDamage(cost, isAoe);
  const damageType = spell.damage_type || "physical";
  const hasStatus  = spell.has_status && spell.status_uuid;

  // ── 5. Бросок атаки (через навык) ──
  let skillItem = null;
  if (spell.skill_uuid && actor) {
    const worldItem = fromUuidSync(spell.skill_uuid);
    skillItem = actor.items.find(i =>
      i.uuid === spell.skill_uuid ||
      i.id  === spell.skill_uuid ||
      (worldItem && i.name === worldItem.name && i.type === worldItem.type)
    ) ?? null;
  }

  // Бонус от палочки
  let wandBonus = 0;
  let wandReasons = [];
  if (!spell.no_wand_needed && skillItem) {
    for (const uuid of (actor.system.artifact_refs || [])) {
      const art = fromUuidSync(uuid);
      if (!art || art.system.artifact_type !== "ring") continue;
      if (art.system.equipped !== "equipped") continue;
      if (!art.system.skill_uuid || !skillItem) continue;
      const wandSkill = fromUuidSync(art.system.skill_uuid);
      if (!wandSkill) continue;
      if (wandSkill.name !== skillItem.name) continue;
      const cond = actor._getItemConditionMod(art);
      if (cond.blocked || !cond.buffActive) continue;
      const raw = art.system.attack_modifier || 0;
      const b   = actor._calcArtifactBonus(raw, cond.buffTier);
      if (b !== 0) { wandBonus += b; wandReasons.push(`${art.name} (кольцо): ${b > 0 ? "+" : ""}${b}`); }
    }
  }

  // Формула броска
  const isWC = actor.type === "character";
  let formula, skillLabel;
  if (skillItem) {
    const die = skillItem.system.die || 4;
    const mod = skillItem.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    formula    = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;
    skillLabel = skillItem.name;
  } else {
    formula    = isWC ? `{1d4, 1d6}kh` : `1d4`;
    skillLabel = "без навыка";
  }
  const finalFormula = wandBonus !== 0
    ? `(${formula})${wandBonus > 0 ? "+" : ""}${wandBonus}`
    : formula;

  const roll = new Roll(finalFormula);
  await roll.evaluate();
  const total   = roll.total;
  const success = total >= 6;

  // ── 6. Чат-сообщение ──
  const dmgLabel  = DAMAGE_LABELS[damageLevel] || damageLevel;
  const typeLabel = damageType === "mental" ? "🧠 Ментальный" : "⚔ Физический";
  const aoeLabel  = isAoe ? " · <span style='color:#c084fc'>Площадное</span>" : "";

  const targetOptions = game.actors
    .filter(a => a.id !== actor.id && ["character","npc-light","npc-hard","npc-boss"].includes(a.type))
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join("");

  const reasons = [...wandReasons];
  if (skillItem?.system?.modifier) {
    const m = skillItem.system.modifier;
    reasons.unshift(`модификатор: ${m > 0 ? "+" : ""}${m}`);
  }

  // Степени успеха
  const spellDegree = _atkSuccessDegree(total);

  const spellWeapon = {
    ...spell,
    damage_level:     damageLevel,
    damage_type:      damageType,
    status_uuid:      spell.status_uuid || "",
    status_name:      spell.status_name || "",
    condition_chance: 0,
    _actorId:         actor.id
  };

  const spellReasons = [...wandReasons];
  if (skillItem?.system?.modifier) {
    const m = skillItem.system.modifier;
    spellReasons.unshift(`модификатор: ${m > 0 ? "+" : ""}${m}`);
  }
  spellReasons.push(`стоимость: ${cost}`);
  if (isAoe) spellReasons.push("площадное");

  const spellDiceHtml = _atkBuildDiceHtml(roll, spellReasons);
  const spellDmgInfo  = success
    ? `${DAMAGE_LABELS[damageLevel] || damageLevel}${extraPips ? ` +${extraPips} пип` : ""} · ${damageType === "mental" ? "Ментальный" : "Физический"} · ${cost} э.`
    : "";
  const spellDmgHtml  = success
    ? _atkDamageButtons(
        { ...spellItem, type: isAoe ? "gear" : spellItem.type },
        spellWeapon, damageLevel, extraPips, hasStatus, targetOptions, false, false,
        isAoe, true
      )
    : `<div class="kk9-atk-nodmg">Атака не прошла.</div>`;

  const spellMsgContent = _atkBuildMessage(actor, spellItem.name, spellDegree, spellDiceHtml, spellDmgInfo, spellDmgHtml);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: spellMsgContent,
    flags: { kk9: { isRoll: true, actorId: actor?.id } }
  });
}

// ── Combat Turn Hook — применяем частотные статусы ──────────
export function registerCombatHooks() {
  // Срабатывает при смене хода
  Hooks.on("combatTurn", async (combat, updateData, updateOptions) => {
    const combatant = combat.combatant;
    if (!combatant?.actor) return;
    const actor = combatant.actor;
    await _processTurnStatuses(actor, "per_turn");
  });

  // Срабатывает при начале нового боя (раз в бой)
  Hooks.on("combatStart", async (combat) => {
    for (const c of combat.combatants) {
      if (!c.actor) continue;
      await _processTurnStatuses(c.actor, "per_combat");
    }
  });
}

async function _processTurnStatuses(actor, frequency) {
  const statuses = foundry.utils.deepClone(actor.system.active_statuses || []);
  if (!statuses.length) return;

  let changed = false;
  const toRemove = [];

  for (let i = 0; i < statuses.length; i++) {
    const st = statuses[i];
    if (st.frequency !== frequency) continue;

    // Применяем урон если есть
    if (st.damage && st.damage !== "none") {
      await applyDamageToActor(actor, st.damage, st.damage_type);
      ChatMessage.create({
        content: `<div style="font-family:'Jost',sans-serif;padding:5px 8px;border-left:3px solid #a855f7;background:var(--bg2,#232323)">
          ${STATUS_ICONS[st.status_type] || "⚡"} <strong>${attackerName}</strong>: статус «${st.statusName}» срабатывает
          (${DAMAGE_LABELS[st.damage]}, ${st.damage_type === "mental" ? "ментально" : "физически"})
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: "Статус" })
      });
    }

    // Уменьшаем счётчик применений
    if (st.uses !== -1) {
      statuses[i].uses -= 1;
      changed = true;
      if (statuses[i].uses <= 0) {
        toRemove.push(i);
        ChatMessage.create({
          content: `<div style="font-family:'Jost',sans-serif;padding:5px 8px;border-left:3px solid #6a6560;background:var(--bg2,#232323)">
            Статус «${st.statusName}» у <strong>${attackerName}</strong> снят (исчерпан).
          </div>`,
          speaker: ChatMessage.getSpeaker({ alias: "Статус" })
        });
      }
    }
  }

  // Удаляем исчерпанные статусы (в обратном порядке)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    statuses.splice(toRemove[i], 1);
    changed = true;
  }

  if (changed) await actor.update({ "system.active_statuses": statuses });
}
