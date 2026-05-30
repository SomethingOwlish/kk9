// ============================================================
// КК9 | weapon-combat.mjs v2.0
// Логика атаки, применения урона и статусов
// ============================================================

// ── Константы ──────────────────────────────────────────────
const DAMAGE_LEVELS = { light: 1, heavy: 2, lethal: 3 };

const DAMAGE_LABELS = {
  light:  "Лёгкий (1 уровень)",
  heavy:  "Тяжёлый (2 уровня)",
  lethal: "Летальный (3 уровня)"
};

// Шкала граней куба для die_change
const DIE_SCALE = [4, 6, 8, 10, 12, 20, 100];

// ── Категории статусов по типу срабатывания ─────────────────
const STATUS_CATEGORY_1 = new Set(["bleed","burn","acid","electric","shock_mental"]);       // каждый бросок
const STATUS_CATEGORY_2 = new Set(["poison","infection","disease","cold"]);                  // раз в N бросков
// category 3 = counter (по раундам) — обрабатывается в _processRoundEnd
// category 4 = debt_fate, debt — только вручную ГМ

// Применить health/energy эффекты статуса к актору
async function _applyStatusEffects(actor, st) {
  for (const eff of (st.system.effects ?? [])) {
    if (!eff.enabled) continue;
    if (eff.type === "health") {
      const h = eff.health;
      if (h.mode === "damage") {
        await applyDamageToActor(actor, _pipsToLevel(h.amount), h.track === "mental" ? "mental" : "physical", h.overflow ?? false);
      } else if (h.mode === "heal") {
        const track = h.track === "mental" ? "system.health.mental.value" : "system.health.physical.value";
        const cur   = h.track === "mental" ? (actor.system.health?.mental?.value ?? 0) : (actor.system.health?.physical?.value ?? 0);
        if (cur > 0) await actor.update({ [track]: Math.max(0, cur - h.amount) });
      }
    }
    if (eff.type === "energy") {
      const e   = eff.energy;
      const cur = actor.system.energy?.value ?? 0;
      const max = actor.system.energy?.max   ?? 0;
      if (e.mode === "current") {
        const newVal = Math.min(max, Math.max(0, cur + (e.amount ?? 0)));
        if (newVal !== cur) await actor.update({ "system.energy.value": newVal });
      } else if (e.mode === "restore") {
        const newVal = Math.min(max, cur + Math.abs(e.amount ?? 0));
        if (newVal > cur) await actor.update({ "system.energy.value": newVal });
      }
    }
  }
}

// Убыть один заряд статуса (или снять если 0)
export async function _decrementStatusCharge(actor, st) {
  const dur    = st.system.duration;
  if (dur?.mode !== "charges") return;
  const newVal = (dur.value ?? 1) - 1;
  if (newVal <= 0) {
    await removeStatusFromActor(actor, st.id);
  } else {
    await st.update({ "system.duration.value": newVal });
    const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
    const ci    = cache.findIndex(c => c.itemId === st.id);
    if (ci >= 0) { cache[ci].duration_value = newVal; await actor.update({ "system.active_statuses": cache }); }
  }
}

// Срабатывание статусов при броске актора (категория 1 и 2)
export async function triggerStatusEffectsOnRoll(actor) {
  if (!actor) return;
  const statuses = actor.items.filter(i => i.type === "status");
  if (!statuses.length) return;

  let N = 3;
  try { N = game.settings.get("kk9", "status.charges_per_trigger") ?? 3; } catch(e) {}

  for (const st of statuses) {
    const types  = st.system.status_types ?? [];
    const isCat1 = types.some(t => STATUS_CATEGORY_1.has(t));
    const isCat2 = types.some(t => STATUS_CATEGORY_2.has(t));
    if (!isCat1 && !isCat2) continue;

    // Категория 1 — каждый бросок
    if (isCat1) {
      await _applyStatusEffects(actor, st);
      // Убываем заряд только если charges режим
      const dur = st.system.duration;
      if (dur?.mode === "charges") await _decrementStatusCharge(actor, st);

    // Категория 2 — раз в N бросков
    } else if (isCat2) {
      const flagKey = `status_roll_count.${st.id}`;
      const count   = (actor.getFlag("kk9", flagKey) ?? 0) + 1;
      if (count >= N) {
        await actor.unsetFlag("kk9", flagKey);
        await _applyStatusEffects(actor, st);
        const dur = st.system.duration;
        if (dur?.mode === "charges") await _decrementStatusCharge(actor, st);
      } else {
        await actor.setFlag("kk9", flagKey, count);
      }
    }
  }
}

// Карта token effects по типу статуса
const STATUS_TOKEN_EFFECTS = {
  poison:       "poison",
  bleed:        "curse",
  acid:         "curse",
  burn:         "burning",
  cold:         "frozen",
  electric:     "shock",
  infection:    "disease",
  disease:      "disease",
  shock_mental: "fear",
  fear:         "fear",
  madness:      "curse",
  blindness:    "blind",
  magic_effect: "curse",
  curse:        "curse",
  debt_fate:    "curse",
  debt:         "curse",
};

// ── Вспомогалка: сдвинуть грань куба на N шагов ────────────
function shiftDie(currentDie, steps) {
  const idx = DIE_SCALE.indexOf(currentDie);
  if (idx === -1) return currentDie;
  const newIdx = Math.max(0, Math.min(DIE_SCALE.length - 1, idx + steps));
  return DIE_SCALE[newIdx];
}

// ── Вспомогалка: получить все активные token effects ────────
async function _getActiveTokenEffectIds(actor) {
  const token = actor.token ?? actor.getActiveTokens()[0]?.document;
  if (!token) return new Set();
  return new Set((token.statuses ?? []).map(s => s));
}

// ── Вспомогалка: добавить/убрать token status ───────────────
async function _setTokenStatus(actor, statusId, active) {
  // Actor#toggleStatusEffect — правильный способ в Foundry v13+
  await actor.toggleStatusEffect(statusId, { active });
}

// ── Применить урон к актору ─────────────────────────────────
export async function applyDamageToActor(actor, damageLevel, damageType, overflow = false) {
  const levels  = DAMAGE_LEVELS[damageLevel] || 1;
  const isBoss  = actor.type === "npc-boss";
  const isPhys  = damageType !== "mental";

  // Спутник — любой урон даёт стан
  if (actor.type === "companion") {
    const inCombat = game?.combat?.combatants?.some(c => c.actorId === actor.id);
    if (inCombat) {
      await actor.update({ "system.is_stunned": true });
      ChatMessage.create({
        content: `<div class="kk9-chat-roll" style="--accent:#6a6560">
          <div class="kk9-chat-header">
            <div class="kk9-chat-header-text" style="padding:5px 10px">
              <span class="kk9-chat-name">${actor.name}</span>
              <span class="kk9-chat-label">получает стан</span>
            </div>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: "" }),
        flags: { kk9: { isRoll: true } }
      });
    } else {
      ChatMessage.create({
        content: `<div class="kk9-chat-roll" style="--accent:#6a6560">
          <div class="kk9-chat-header">
            <div class="kk9-chat-header-text" style="padding:5px 10px">
              <span class="kk9-chat-name">${actor.name}</span>
              <span class="kk9-chat-label">получает урон · вне боя</span>
            </div>
          </div>
        </div>`,
        speaker: ChatMessage.getSpeaker({ alias: "" }),
        flags: { kk9: { isRoll: true } }
      });
    }
    return { levels, newVal: 0, isCompanion: true };
  }

  // Босс — нет пипов, весь урон идёт в overflow_damage
  if (isBoss) {
    const cur = actor.system.overflow_damage ?? 0;
    const newVal = cur + levels;
    await actor.update({ "system.overflow_damage": newVal });
    return { levels, newVal, isBoss: true };
  }

  const physVal = actor.system.health?.physical?.value ?? 0;
  const mentVal = actor.system.health?.mental?.value   ?? 0;

  if (isPhys) {
    const newPhys = Math.min(physVal + levels, 5);
    const leftover = (physVal + levels) - 5;
    const update = { "system.health.physical.value": newPhys };
    if (overflow && leftover > 0) {
      const newMent = Math.min(mentVal + leftover, 5);
      const overflowMent = (mentVal + leftover) - 5;
      update["system.health.mental.value"] = newMent;
      if (overflowMent > 0) {
        update["system.overflow_damage"] = (actor.system.overflow_damage ?? 0) + overflowMent;
      }
    }
    await actor.update(update);
    return { levels, newVal: newPhys };
  } else {
    const newMent = Math.min(mentVal + levels, 5);
    const leftover = (mentVal + levels) - 5;
    const update = { "system.health.mental.value": newMent };
    if (overflow && leftover > 0) {
      update["system.overflow_damage"] = (actor.system.overflow_damage ?? 0) + leftover;
    }
    await actor.update(update);
    return { levels, newVal: newMent };
  }
}

// ============================================================
// СТАТУСЫ — ПРИМЕНЕНИЕ К АКТОРУ (embedded Item)
// ============================================================
export async function applyStatusToActor(actor, statusItem) {
  // 1. Создаём embedded Item-копию на акторе
  const itemData = statusItem.toObject();
  // Сбрасываем id чтобы создать новый экземпляр
  delete itemData._id;
  const [created] = await Item.createDocuments([itemData], { parent: actor });
  if (!created) {
    ui.notifications.error("Не удалось создать статус на акторе.");
    return;
  }

  // 2. Обновляем display-cache active_statuses[]
  const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
  cache.push({
    itemId:        created.id,
    statusName:    created.name,
    status_types:  created.system.status_types ?? [],
    duration_mode:  created.system.duration?.mode  ?? "time",
    duration_value: created.system.duration?.value ?? 1,
  });
  await actor.update({ "system.active_statuses": cache });

  // 3. Token effects — по типам статуса
  const types = created.system.status_types ?? [];
  const addedEffects = new Set();
  for (const t of types) {
    const effectId = STATUS_TOKEN_EFFECTS[t];
    if (effectId && !addedEffects.has(effectId)) {
      await _setTokenStatus(actor, effectId, true);
      addedEffects.add(effectId);
    }
  }
  // Stun — отдельно
  if (created.system.apply_stun) {
    await _setTokenStatus(actor, "stun", true);
  }

  // 4. Чат-сообщение о наложении
  const typeLabels = types.map(t => _statusTypeLabel(t)).join(", ") || "—";
  const durText = _durationText(created.system.duration);
  ChatMessage.create({
    content: `<div class="kk9-chat-roll" style="--accent:#a855f7">
      <div class="kk9-chat-header">
        <div class="kk9-chat-header-text" style="padding:5px 10px">
          <span class="kk9-chat-name">${created.name}</span>
          <span class="kk9-chat-label">наложен на · ${actor.name}</span>
        </div>
      </div>
      <div style="padding:4px 10px 6px;font-size:0.78em;color:var(--text-dim,#6a6560);font-family:'Jost',sans-serif">
        ${typeLabels} · ${durText}${created.system.removal_instruction ? `<br>Снятие: ${created.system.removal_instruction}` : ""}
      </div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: "" }),
    flags: { kk9: { isRoll: true } }
  });
}

// ============================================================
// СТАТУСЫ — СНЯТИЕ С АКТОРА
// ============================================================
export async function removeStatusFromActor(actor, itemId) {
  // Найти embedded Item
  const statusItem = actor.items.get(itemId);
  const statusName = statusItem?.name ?? "Статус";
  const types      = statusItem?.system?.status_types ?? [];
  const hadStun    = statusItem?.system?.apply_stun ?? false;

  // Удалить embedded Item
  if (statusItem) await statusItem.delete();

  // Обновить display-cache
  const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
  const idx   = cache.findIndex(s => s.itemId === itemId);
  if (idx >= 0) cache.splice(idx, 1);
  await actor.update({ "system.active_statuses": cache });

  // Снять token effects если больше нет статусов с тем же типом
  const remainingItems = actor.items.filter(i => i.type === "status");
  const remainingTypes = new Set(remainingItems.flatMap(i => i.system.status_types ?? []));
  const remainingStun  = remainingItems.some(i => i.system.apply_stun);

  for (const t of types) {
    const effectId = STATUS_TOKEN_EFFECTS[t];
    if (effectId && !remainingTypes.has(t)) {
      // Проверяем — нет ли другого типа который даёт тот же effectId
      const otherTypesWithSameEffect = Object.entries(STATUS_TOKEN_EFFECTS)
        .filter(([k, v]) => v === effectId && k !== t)
        .map(([k]) => k);
      const stillNeeded = otherTypesWithSameEffect.some(ot => remainingTypes.has(ot));
      if (!stillNeeded) await _setTokenStatus(actor, effectId, false);
    }
  }
  if (hadStun && !remainingStun) {
    await _setTokenStatus(actor, "stun", false);
  }

  // Чат-сообщение о снятии
  ChatMessage.create({
    content: `<div class="kk9-chat-roll" style="--accent:#6a6560">
      <div class="kk9-chat-header">
        <div class="kk9-chat-header-text" style="padding:5px 10px">
          <span class="kk9-chat-name">${statusName}</span>
          <span class="kk9-chat-label">снят с · ${actor.name}</span>
        </div>
      </div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: "" }),
    flags: { kk9: { isRoll: true } }
  });
}

// ── Вспомогалки для чат-сообщений ──────────────────────────
function _statusTypeLabel(type) {
  return ({
    poison:"Яд", bleed:"Кровотечение", acid:"Кислота", burn:"Ожог",
    cold:"Холод", electric:"Электричество", infection:"Заражение",
    disease:"Болезнь", shock_mental:"Шок", fear:"Страх", madness:"Безумие",
    blindness:"Слепота", magic_effect:"Маг. эффект", curse:"Проклятие",
    debt_fate:"Долг судьбы", debt:"Долг",
  })[type] || type;
}

function _durationText(duration) {
  if (!duration) return "время не указано";
  const val = duration.value ?? 1;
  if (duration.mode === "time")    return `длит.: ${val} (вручную)`;
  if (duration.mode === "counter") return `${val} раундов`;
  if (duration.mode === "charges") return `${val} зарядов`;
  return "—";
}


// Форматирует результат урона для чата
function _damageResultLabel(target, newVal, damageType, isBoss, hasStatus, statusUuid) {
  const typeStr = damageType === "mental" ? "Ментал." : "Физич.";
  const statStr = hasStatus && statusUuid ? " · статус" : "";
  if (isBoss) return `урон · оверкап: ${newVal}${statStr}`;
  return `урон · ${typeStr}: ${newVal}/5${statStr}`;
}

// ============================================================
// COMBAT HOOKS — counter убывание, DoT здоровье, stun
// ============================================================
export function registerCombatHooks() {

  // ── Конец раунда: counter убывает, health DoT срабатывает ──
  Hooks.on("combatRound", async (combat, updateData, updateOptions) => {
    if (updateOptions.direction < 0) return; // перемотка назад — пропускаем
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;
      await _processRoundEnd(actor);
    }
  });

  // ── Конец хода: stun применяется на следующий ход ──────────
  Hooks.on("combatTurn", async (combat, updateData, updateOptions) => {
    if (updateOptions.direction < 0) return;
    const prev = combat.combatants.get(updateData.combatantId ?? combat.previous?.combatantId);
    const actor = prev?.actor;
    if (!actor) return;
    await _processStunOnTurnEnd(actor);
  });

  // ── Конец боя: counter-статусы с оставшимся временем → time ──
  Hooks.on("deleteCombat", async (combat) => {
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor) continue;
      const counterStatuses = actor.items.filter(i =>
        i.type === "status" && i.system.duration?.mode === "counter" && (i.system.duration?.value ?? 0) > 0
      );
      for (const st of counterStatuses) {
        await st.update({ "system.duration.mode": "time" });
      }
    }
  });
}

async function _processRoundEnd(actor) {
  const statuses = actor.items.filter(i => i.type === "status");
  if (!statuses.length) return;

  for (const st of statuses) {
    const dur = st.system.duration;

    // time-статусы НЕ применяют health/energy автоматически
    if (dur?.mode === "time") {
      // Counter убывание пропускаем тоже
      continue;
    }

    for (const eff of (st.system.effects ?? [])) {
      if (!eff.enabled) continue;

      // ── Health DoT ──
      if (eff.type === "health") {
        const h = eff.health;
        if (h.mode === "damage") {
          await applyDamageToActor(actor, _pipsToLevel(h.amount), h.track === "mental" ? "mental" : "physical", h.overflow);
        } else if (h.mode === "heal") {
          const track = h.track === "mental" ? "system.health.mental.value" : "system.health.physical.value";
          const cur   = h.track === "mental" ? (actor.system.health?.mental?.value ?? 0) : (actor.system.health?.physical?.value ?? 0);
          if (cur > 0) await actor.update({ [track]: Math.max(0, cur - h.amount) });
        }
      }

      // ── Energy ──
      if (eff.type === "energy") {
        const e   = eff.energy;
        const cur = actor.system.energy?.value ?? 0;
        const max = actor.system.energy?.max   ?? 0;

        if (e.mode === "current") {
          const newVal = Math.min(max, Math.max(0, cur + (e.amount ?? 0)));
          if (newVal !== cur) await actor.update({ "system.energy.value": newVal });
        } else if (e.mode === "restore") {
          const newVal = Math.min(max, cur + Math.abs(e.amount ?? 0));
          if (newVal > cur) await actor.update({ "system.energy.value": newVal });
        }
        // max и roll_mod — не обрабатываем здесь
      }
    }

    // ── Charges — убываем после применения эффектов ──
    if (dur?.mode === "charges" && dur.auto_reduce) {
      const newVal = (dur.value ?? 1) - 1;
      if (newVal <= 0) {
        await removeStatusFromActor(actor, st.id);
      } else {
        await st.update({ "system.duration.value": newVal });
        const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
        const ci    = cache.findIndex(c => c.itemId === st.id);
        if (ci >= 0) { cache[ci].duration_value = newVal; await actor.update({ "system.active_statuses": cache }); }
      }
    }

    // ── Counter — убываем ──
    if (dur?.mode === "counter" && dur.auto_reduce) {
      const newVal = (dur.value ?? 1) - 1;
      if (newVal <= 0) {
        await removeStatusFromActor(actor, st.id);
      } else {
        await st.update({ "system.duration.value": newVal });
        const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
        const ci    = cache.findIndex(c => c.itemId === st.id);
        if (ci >= 0) { cache[ci].duration_value = newVal; await actor.update({ "system.active_statuses": cache }); }
      }
    }
  }
}

async function _processStunOnTurnEnd(actor) {
  const statuses = actor.items.filter(i => i.type === "status" && i.system.apply_stun);
  if (!statuses.length) return;
  // Stun уже висит на токене через token effect — просто убеждаемся
  await _setTokenStatus(actor, "stun", true);
}

// Вспомогалка: пипы → уровень урона (для DoT)
function _pipsToLevel(pips) {
  if (pips >= 3) return "lethal";
  if (pips >= 2) return "heavy";
  return "light";
}

// ============================================================
// ПРИМЕНЕНИЕ УРОНА К АКТОРУ (из чата)
// ============================================================
export async function applyDamageToActor_simple(actor, damageLevel, damageType) {
  return applyDamageToActor(actor, damageLevel, damageType, false);
}

// ============================================================
// БРОСКИ — МОДИФИКАТОРЫ СТАТУСОВ
// ============================================================

// Собрать все модификаторы статусов для конкретного броска
// rollContext = { type, attributeKey, itemType, skillUuid, isToughness, isInitiative }
export function collectStatusModifiers(actor, rollContext) {
  const statuses = actor.items.filter(i => i.type === "status");
  let dieMod       = 0;
  let numericMod   = 0;
  let successMod   = 0;
  let extraDice    = []; // [{ faces, mode, name }]
  const reasons    = [];
  const usedIds    = []; // id статусов с charges для убывания

  for (const st of statuses) {
    for (const eff of (st.system.effects ?? [])) {
      if (!eff.enabled || eff.type !== "roll_modifier") continue;
      const rm = eff.roll_modifier;
      if (!_rollMatchesTarget(rm, rollContext)) continue;

      if (rm.die_change)       { dieMod     += rm.die_change;     reasons.push(`${st.name}: ${rm.die_change > 0 ? "+" : ""}${rm.die_change} гр.`); }
      if (rm.modifier)         { numericMod += rm.modifier;       reasons.push(`${st.name}: ${rm.modifier > 0 ? "+" : ""}${rm.modifier}`); }
      if (rm.success_modifier) { successMod += rm.success_modifier; reasons.push(`${st.name}: ${rm.success_modifier > 0 ? "+" : ""}${rm.success_modifier} усп.`); }
      if (rm.extra_die_enabled) {
        extraDice.push({ faces: rm.extra_die_faces, mode: rm.extra_die_mode, name: st.name });
        reasons.push(`${st.name}: доп. d${rm.extra_die_faces}`);
      }

      // Charges — отмечаем для убывания после броска
      if (st.system.duration?.mode === "charges" && st.system.duration?.auto_reduce) {
        usedIds.push(st.id);
      }
    }
  }

  return { dieMod, numericMod, successMod, extraDie: extraDice.length ? extraDice[0] : null, extraDice, reasons, usedIds };
}

// Применить эффекты статуса вручную (ГМ — для debt/debt_fate)
export async function _applyStatusEffectsManual(actor, st) {
  await _applyStatusEffects(actor, st);
  // Убываем заряд если charges
  const dur = st.system.duration;
  if (dur?.mode === "charges") await _decrementStatusCharge(actor, st);
  ChatMessage.create({
    content: `<div class="kk9-chat-roll" style="--accent:#c4a44a">
      <div class="kk9-chat-header"><div class="kk9-chat-header-text" style="padding:5px 10px">
        <span class="kk9-chat-name">${actor.name}</span>
        <span class="kk9-chat-label">${st.name} — применён вручную</span>
      </div></div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: "Система" }),
    flags: { kk9: { isRoll: true } }
  });
}

// Убыть заряды после броска (roll_modifier charges)
export async function consumeStatusCharges(actor, statusIds) {
  for (const id of statusIds) {
    const st = actor.items.get(id);
    if (!st) continue;
    const val = (st.system.duration?.value ?? 1) - 1;
    if (val <= 0) {
      await removeStatusFromActor(actor, id);
    } else {
      await st.update({ "system.duration.value": val });
      const cache = foundry.utils.deepClone(actor.system.active_statuses || []);
      const ci    = cache.findIndex(c => c.itemId === id);
      if (ci >= 0) { cache[ci].duration_value = val; await actor.update({ "system.active_statuses": cache }); }
    }
  }
}

// Проверка — применяется ли эффект к данному броску
function _rollMatchesTarget(rm, ctx) {
  if (rm.target_all) return true;

  // Атрибут
  if (ctx.attributeKey) {
    const attrKey = `target_${ctx.attributeKey}`;
    if (rm[attrKey]) return true;
    // Авто-правила: agility/smarts → инициатива; spirit → стойкость
    if (ctx.isInitiative && (rm.target_agility || rm.target_smarts)) return true;
    if (ctx.isToughness  && rm.target_spirit)                        return true;
  }

  // Отдельные флаги
  if (ctx.isToughness  && rm.target_toughness)  return true;
  if (ctx.isInitiative && rm.target_initiative)  return true;

  // Тип предмета
  if (ctx.itemType) {
    if (rm.target_all_items) return true;
    const itemKey = `target_${ctx.itemType}`;
    if (rm[itemKey]) return true;
  }

  // Конкретный навык
  if (ctx.skillUuid && rm.target_skills?.some(s => s.uuid === ctx.skillUuid)) return true;

  return false;
}


// Строит HTML кубиков для сообщений атаки (та же логика что _buildDiceHtml)
function _renderAttackDiceHtml(roll, reasons = []) {
  const lines = [];
  const renderDice = (terms) => {
    for (const t of terms) {
      if (Array.isArray(t.rolls) && Array.isArray(t.results)) {
        t.rolls.forEach((r, idx) => {
          const poolEntry   = t.results[idx] ?? {};
          const isDiscarded = poolEntry.active === false || poolEntry.discarded === true;
          const die = r.terms?.find(dt => typeof dt.faces === "number" && Array.isArray(dt.results));
          if (!die) return;
          const rollStr = die.results.map(rv => {
            const boom = rv.exploded ? "💥" : "";
            return `<span class="kk9-rv ${isDiscarded?"dr":"dk"}">${boom}${rv.result}</span>`;
          }).join('<span class="kk9-rplus">+</span>');
          const total = die.results.reduce((s,r)=>s+r.result,0);
          lines.push(`<div class="kk9-drow ${isDiscarded?"discarded":"kept"}"><span class="kk9-dlabel">d${die.faces}</span><span class="kk9-dvals">${rollStr}</span>${!isDiscarded?`<span class="kk9-dsum">= ${total}</span>`:""}</div>`);
        });
      } else if (typeof t.faces === "number" && Array.isArray(t.results)) {
        const rollStr = t.results.map(rv => {
          const boom = rv.exploded ? "💥" : "";
          return `<span class="kk9-rv dk">${boom}${rv.result}</span>`;
        }).join('<span class="kk9-rplus">+</span>');
        const total = t.results.reduce((s,r)=>s+r.result,0);
        lines.push(`<div class="kk9-drow kept"><span class="kk9-dlabel">d${t.faces}</span><span class="kk9-dvals">${rollStr}</span><span class="kk9-dsum">= ${total}</span></div>`);
      } else if (Array.isArray(t.terms)) renderDice(t.terms);
      else if (t.roll?.terms) renderDice(t.roll.terms);
    }
  };
  renderDice(roll.terms);
  if (reasons.length) {
    lines.push('<div class="kk9-dsep"></div>');
    reasons.forEach(r => lines.push(`<div class="kk9-drow kk9-dbonus"><span class="kk9-dlabel">→</span><span class="kk9-dvals">${r}</span></div>`));
  }
  return lines.length ? `<div class="kk9-dice-body">${lines.join("")}</div>` : "";
}

// То же но с явным итогом (для ветки без навыка)
function _renderAttackDiceHtmlWithTotal(roll, reasons = [], overrideTotal = null) {
  const base = _renderAttackDiceHtml(roll, []);
  const displayTotal = overrideTotal !== null ? overrideTotal : roll.total;
  const reasonLines = reasons.map(r =>
    `<div class="kk9-drow kk9-dbonus"><span class="kk9-dlabel">→</span><span class="kk9-dvals">${r}</span></div>`
  ).join("");
  const totalLine = `<div class="kk9-dsep"></div><div class="kk9-drow kk9-dtotal"><span class="kk9-dlabel">итог</span><span class="kk9-dtotal-val">${displayTotal}</span></div>`;
  // base уже содержит kk9-dice-body обёртку — вставляем reasons и total внутрь
  if (!base) return "";
  return base.replace("</div>", `${reasonLines}${totalLine}</div>`);
}

// ============================================================
// БРОСОК АТАКИ ОРУЖИЕМ
// ============================================================
export async function rollWeaponAttack(weaponItem, actor) {
  const weapon = weaponItem.system;

  // Найти skillItem на акторе — нужен его id для rollSkillItem
  let skillItem = null;
  if (weapon.skill_uuid && actor) {
    // Ищем по прямому uuid, короткому id, или по sourceId компендиума
    const shortId = weapon.skill_uuid.split(".").pop();
    skillItem = actor.items.find(i =>
      i.uuid === weapon.skill_uuid ||
      i.id   === weapon.skill_uuid ||
      i.id   === shortId ||
      (i.system?.sourceId ?? i.flags?.kk9?.sourceId) === weapon.skill_uuid
    );
    // Если не нашли — ищем по имени через compendium uuid
    if (!skillItem) {
      try {
        const compItem = fromUuidSync(weapon.skill_uuid);
        if (compItem?.name) {
          skillItem = actor.items.find(i => i.name === compItem.name && i.type === compItem.type);
        }
      } catch(e) {}
    }
  }

  // Строим данные для чата
  const hasStatus  = weapon.has_status && weapon.status_uuid;
  const dmgLabel   = DAMAGE_LABELS[weapon.damage_level] || weapon.damage_level;
  const typeLabel  = weapon.damage_type === "mental" ? "Ментальный" : "Физический";
  const statusInfo = hasStatus ? ` + ${weapon.status_name || "статус"}` : "";

  const targetOptions = _getTargetCandidates(actor?.id)
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  if (skillItem && actor) {
    // ── Используем rollSkillItem актора — он применяет здоровье, статусы, артефакты ──
    // Перехватываем ChatMessage чтобы добавить кнопки атаки поверх
    let interceptedContent = null;
    let interceptedSpeaker = null;
    const hookId = Hooks.once("preCreateChatMessage", (doc, data) => {
      interceptedContent = data.content ?? doc.content;
      interceptedSpeaker = data.speaker ?? doc.speaker;
      return false;
    });

    const result = await actor.rollSkillItem(skillItem.id);
    if (!result) { Hooks.off("preCreateChatMessage", hookId); return; }

    const { roll, degree } = result;
    const total   = roll.total;
    const success = degree.type === "success";

    // Дополняем контент кнопками атаки
    const baseContent = interceptedContent ?? "";
    const attackBlock = success ? `
<div class="kk9-attack-actions" style="padding:6px 10px;border-top:1px solid var(--border,#2a2a2a);display:flex;gap:5px;flex-wrap:wrap">
  <select id="kk9-target-select-${weaponItem.id}" style="flex:1;min-width:120px;background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text,#b8b0a4);padding:2px 6px;font-size:0.8em;font-family:'Jost',sans-serif">
    <option value="">— выбери цель —</option>${targetOptions}
  </select>
  <button class="kk9-apply-damage" data-weapon-id="${weaponItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${weapon.damage_level}" data-damage-type="${weapon.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${weapon.status_uuid||""}" style="background:rgba(160,41,30,0.2);border:1px solid rgba(160,41,30,0.4);border-radius:3px;color:#c0392b;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Засчитать урон</button>
  <button class="kk9-resist-roll" data-weapon-id="${weaponItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${weapon.damage_level}" data-damage-type="${weapon.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${weapon.status_uuid||""}" style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:3px;color:#4ade80;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Стойкость</button>
  <button class="kk9-miss" style="background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Промах</button>
</div>` : `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;padding:4px 10px;border-top:1px solid var(--border,#2a2a2a)">Атака не прошла.</div>`;

    // Вставляем перед закрывающим </div> kk9-chat-roll
    // Вставляем кнопки атаки внутрь kk9-chat-roll перед последним закрывающим тегом
    const lastClose = baseContent.lastIndexOf("</div>");
    const finalContent = lastClose >= 0
      ? baseContent.slice(0, lastClose) + attackBlock + baseContent.slice(lastClose)
      : baseContent + attackBlock;

    await ChatMessage.create({
      speaker: interceptedSpeaker ?? ChatMessage.getSpeaker({ actor }),
      content: finalContent,
      flags:   { kk9: { isRoll: true, actorId: actor?.id } }
    });

  } else {
    // ── Нет навыка — простой бросок d4-2 ──
    const stMods = actor ? collectStatusModifiers(actor, {
      attributeKey: null, itemType: weaponItem.type,
      skillUuid: null, isToughness: false, isInitiative: false,
    }) : { dieMod:0, numericMod:0, successMod:0, extraDice:[], reasons:[], usedIds:[] };

    const itemMod  = weapon.modifier || 0;
    const totalMod = itemMod + stMods.numericMod;
    const modStr   = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWC     = actor?.type === "character";

    // Применяем die_change
    let baseDie = 4;
    if (stMods.dieMod !== 0) baseDie = shiftDie(baseDie, stMods.dieMod);
    const formula = isWC ? `{1d${baseDie}x-2${modStr}, 1d6x-2${modStr}}kh` : `1d${baseDie}x-2${modStr}`;

    const roll = new Roll(formula);
    await roll.evaluate();

    if (actor && stMods.usedIds.length) await consumeStatusCharges(actor, stMods.usedIds);

    // Доп. кубики от статусов
    let extraDieTotal = 0;
    const allReasons  = [];
    if (itemMod !== 0) allReasons.push(`${weaponItem.name}: ${itemMod > 0 ? "+" : ""}${itemMod}`);
    allReasons.push(...stMods.reasons.filter(r => !r.includes("доп.")));
    for (const ed of (stMods.extraDice ?? [])) {
      const sign      = ed.mode === "add" ? 1 : -1;
      const extraRoll = new Roll(`1d${ed.faces}`);
      await extraRoll.evaluate();
      extraDieTotal += sign * extraRoll.total;
      const signStr  = sign > 0 ? `+1d${ed.faces} = +${extraRoll.total}` : `-1d${ed.faces} = −${extraRoll.total}`;
      allReasons.push(`${ed.name ?? "Статус"}: ${signStr}`);
    }

    const rollTotal = roll.total + extraDieTotal;
    const degree    = (() => {
      if (rollTotal <= 0) return { type:"snake_eyes", label:"Глаза змеи", successes: 0 };
      if (rollTotal < 4)  return { type:"failure",    label:"Неудача",     successes: 0 };
      const s = 1 + Math.floor((rollTotal - 4) / 4);
      return { type:"success", label: s===1?"1 успех":s<=4?`${s} успеха`:`${s} успехов`, successes: s };
    })();

    // successMod — к числу успехов
    if (stMods.successMod !== 0 && degree.type === "success") {
      degree.successes = Math.max(0, degree.successes + stMods.successMod);
      const s = degree.successes;
      degree.label = s===1?"1 успех":s<=4?`${s} успеха`:`${s} успехов`;
    }
    const success = degree.type === "success";

    const resultClass = {snake_eyes:"kk9-result-snake",failure:"kk9-result-failure",success:"kk9-result-success"}[degree.type];
    const portrait    = actor?.img || "icons/svg/mystery-man.svg";
    const fColors     = {white:"#e8e8e8",black:"#888888",blue:"#3b82f6",green:"#22c55e",purple:"#a855f7",red:"#ef4444",brown:"#92400e",mercury:"#94a3b8",invisible:"#6b7280"};
    const fKey        = actor?.system?.faculty_key || actor?.system?.faculty;
    const accent      = (fKey && fKey!=="none") ? (fColors[fKey]||"#c4a44a") : "#c4a44a";

    // Строим расшифровку с итогом
    const diceHtml = _renderAttackDiceHtmlWithTotal(roll, allReasons, rollTotal);

    const content = `<div class="kk9-chat-roll kk9-attack-roll" data-result-type="${degree.type}" style="--accent:${accent}">
  <div class="kk9-chat-header">
    <img class="kk9-chat-portrait" src="${portrait}" alt="${actor?.name??""}">
    <div class="kk9-chat-header-text">
      <span class="kk9-chat-name">${actor?.name??""}</span>
      <span class="kk9-chat-label">${weaponItem.name} — атака</span>
    </div>
  </div>
  <div class="kk9-attack-meta" style="font-size:0.76em;color:var(--text-dim,#6a6560);padding:0 10px 4px">без навыка · ${dmgLabel} · ${typeLabel}${statusInfo}</div>
  <details class="kk9-result-details">
    <summary class="kk9-result-summary ${resultClass}"><span class="kk9-result-text">${degree.label}</span></summary>
    ${diceHtml}
  </details>
  ${success ? `<div class="kk9-attack-actions" style="padding:6px 10px;border-top:1px solid var(--border,#2a2a2a);display:flex;gap:5px;flex-wrap:wrap">
    <select id="kk9-target-select-${weaponItem.id}" style="flex:1;min-width:120px;background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text,#b8b0a4);padding:2px 6px;font-size:0.8em;font-family:'Jost',sans-serif"><option value="">— выбери цель —</option>${targetOptions}</select>
    <button class="kk9-apply-damage" data-weapon-id="${weaponItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${weapon.damage_level}" data-damage-type="${weapon.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${weapon.status_uuid||""}" style="background:rgba(160,41,30,0.2);border:1px solid rgba(160,41,30,0.4);border-radius:3px;color:#c0392b;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Засчитать урон</button>
    <button class="kk9-resist-roll" data-weapon-id="${weaponItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${weapon.damage_level}" data-damage-type="${weapon.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${weapon.status_uuid||""}" style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:3px;color:#4ade80;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Стойкость</button>
    <button class="kk9-miss" style="background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Промах</button>
  </div>` : `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;padding:4px 10px;border-top:1px solid var(--border,#2a2a2a)">Атака не прошла.</div>`}
</div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `${weaponItem.name} — атака`,
      content,
      flags:   { kk9: { isRoll: true, actorId: actor?.id } }
    });
  }
}



// Таблица cost → damage для заклинаний
function calcSpellDamage(cost, isAoe) {
  let level, extraPips = 0;
  if (isAoe) {
    if (cost <= 4)       { level = "light";  }
    else if (cost <= 8)  { level = "heavy";  }
    else if (cost <= 14) { level = "lethal"; }
    else                 { level = "lethal"; extraPips = Math.floor((cost - 14) / 8); }
  } else {
    if (cost <= 2)       { level = "light";  }
    else if (cost <= 6)  { level = "heavy";  }
    else if (cost <= 12) { level = "lethal"; }
    else                 { level = "lethal"; extraPips = Math.floor((cost - 12) / 6); }
  }
  return { level, extraPips };
}

// ============================================================
// БРОСОК ЗАКЛИНАНИЯ
// ============================================================
export async function rollSpellAttack(spellItem, actor) {
  const spell = spellItem.system;

  let skillItem = null;
  if (spell.skill_uuid && actor) {
    const shortId = spell.skill_uuid.split(".").pop();
    skillItem = actor.items.find(i =>
      i.uuid === spell.skill_uuid ||
      i.id   === spell.skill_uuid ||
      i.id   === shortId ||
      (i.system?.sourceId ?? i.flags?.kk9?.sourceId) === spell.skill_uuid
    );
    if (!skillItem) {
      try {
        const compItem = fromUuidSync(spell.skill_uuid);
        if (compItem?.name) {
          skillItem = actor.items.find(i => i.name === compItem.name && i.type === compItem.type);
        }
      } catch(e) {}
    }
  }

  const cost = spell.cost || 1;
  const curEnergy = actor?.system.energy?.value ?? 0;

  // ── Превозмогание ──────────────────────────────────────────
  let spellBlocked    = false;
  let spellOvercast   = false;
  if (curEnergy < cost) {
    const overcostPips = cost - curEnergy;
    const damType = spell.damage_type === "mental" ? "mental" : "physical";

    // Правило: если пипы типа заклинания уже 5/5 — нельзя превозмогать
    const primaryVal = damType === "mental"
      ? (actor.system.health?.mental?.value   ?? 0)
      : (actor.system.health?.physical?.value ?? 0);
    if (primaryVal >= 5) {
      ui.notifications.warn(`${actor.name}: все пипы закрашены — превозмогание невозможно.`);
      return;
    }

    // Диалог выбора
    const proceed = await new Promise(resolve => {
      new Dialog({
        title: "Недостаточно энергии",
        content: `<div style="font-family:'Jost',sans-serif;padding:4px 0">
          <div style="font-size:0.85em;color:#b8b0a4;margin-bottom:8px">
            Не хватает <strong style="color:#c4a44a">${overcostPips}</strong> ед. энергии.
          </div>
          <div style="font-size:0.78em;color:#6a6560">
            При превозмогании — бросок Духа ≥ 6.<br>
            Провал: заклинание не работает, но урон от перерасхода наносится.
          </div>
        </div>`,
        buttons: {
          overcast: { label: "Превозмочь", callback: () => resolve(true) },
          cancel:   { label: "Отказаться", callback: () => resolve(false) }
        },
        default: "cancel",
        render: (html) => {
          const $d = html.closest(".app.dialog");
          $d.css("background","#1c1c1c");
          $d.find(".window-content").css("background","#1c1c1c");
          $d.find(".dialog-button").css({ background:"#2a2a2a", border:"1px solid #3a3a3a", "border-radius":"4px", color:"#b8b0a4", "font-family":"'Jost',sans-serif", "font-size":"0.85em", padding:"5px 14px", cursor:"pointer" });
          $d.find(".dialog-button[data-button='overcast']").css({ "border-color":"#c4a44a", color:"#c4a44a" });
        }
      }, { width: 320 }).render(true);
    });

    if (!proceed) return;

    // Списываем всю оставшуюся энергию
    await actor.update({ "system.energy.value": 0 });

    // Бросок Духа >= 6
    const spiritDie = actor.system.attributes?.spirit?.die || 4;
    const isWCSpirit = actor.type === "character";
    const spiritFormula = isWCSpirit ? `{1d${spiritDie}x, 1d6x}kh` : `1d${spiritDie}x`;
    const spiritRoll = new Roll(spiritFormula);
    await spiritRoll.evaluate();
    await spiritRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${actor.name} — Дух (превозмогание)`,
      flags: { kk9: { isRoll: true, actorId: actor.id } }
    });

    if (spiritRoll.total < 6) spellBlocked = true;
    else spellOvercast = true;

    // Урон от перерасхода 2:1 → тип заклинания → другая шкала → оверкап
    const overcostPipsHealth = Math.ceil(overcostPips / 2);
    let remaining = overcostPipsHealth;
    const physVal = actor.system.health?.physical?.value ?? 0;
    const mentVal = actor.system.health?.mental?.value   ?? 0;
    const CAP = 5;
    const update = {};

    if (damType === "mental") {
      // Ментал → физ → оверкап
      const mentDmg = Math.min(remaining, CAP - mentVal);
      remaining -= mentDmg;
      if (mentDmg > 0) update["system.health.mental.value"] = mentVal + mentDmg;
      if (remaining > 0) {
        const physDmg = Math.min(remaining, CAP - physVal);
        remaining -= physDmg;
        if (physDmg > 0) update["system.health.physical.value"] = physVal + physDmg;
      }
    } else {
      // Физ → ментал → оверкап
      const physDmg = Math.min(remaining, CAP - physVal);
      remaining -= physDmg;
      if (physDmg > 0) update["system.health.physical.value"] = physVal + physDmg;
      if (remaining > 0) {
        const mentDmg = Math.min(remaining, CAP - mentVal);
        remaining -= mentDmg;
        if (mentDmg > 0) update["system.health.mental.value"] = mentVal + mentDmg;
      }
    }
    if (remaining > 0) update["system.overflow_damage"] = (actor.system.overflow_damage ?? 0) + remaining;
    if (Object.keys(update).length) await actor.update(update);

    ChatMessage.create({
      content: `<div class="kk9-chat-roll" style="--accent:#a855f7">
        <div class="kk9-chat-header"><div class="kk9-chat-header-text" style="padding:5px 10px">
          <span class="kk9-chat-name">${actor.name}</span>
          <span class="kk9-chat-label">превозмогание · −${overcostPipsHealth} пип${spellBlocked ? " · провал духа" : ""}</span>
        </div></div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: "Система" }),
      flags: { kk9: { isRoll: true } }
    });

    if (spellBlocked) return;
  } else {
    // Достаточно энергии — списываем нормально
    await actor.update({ "system.energy.value": curEnergy - cost });
  }

  const hasStatus = spell.has_status && spell.status_uuid;
  const dmgLabel  = DAMAGE_LABELS[spell.damage_level] || spell.damage_level;
  const typeLabel = spell.damage_type === "mental" ? "Ментальный" : "Физический";

  const targetOptions = _getTargetCandidates(actor?.id)
    .map(c => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  if (skillItem && actor) {
    let interceptedContent = null;
    let interceptedSpeaker = null;
    const hookId = Hooks.once("preCreateChatMessage", (doc, data) => {
      interceptedContent = data.content ?? doc.content;
      interceptedSpeaker = data.speaker ?? doc.speaker;
      return false;
    });

    let result;
    if (spellOvercast) {
      // При превозмогании — _doRoll напрямую без проверки здоровья (attrKey: null)
      const die     = skillItem.system.die || 4;
      const baseMod = skillItem.system.modifier || 0;
      const modStr  = baseMod !== 0 ? (baseMod > 0 ? `+${baseMod}` : `${baseMod}`) : "";
      const isWC    = actor.type === "character";
      const formula = actor._rollFormula(die, modStr, isWC);
      result = await actor._doRoll(formula, skillItem.name, {
        attrKey: null, skillUuid: skillItem.uuid, itemType: "spell",
      });
    } else {
      result = await actor.rollSkillItem(skillItem.id);
    }
    if (!result) { Hooks.off("preCreateChatMessage", hookId); return; }

    const { roll, degree } = result;
    const success = degree.type === "success";

    // Вычисляем урон из cost
    const isAoe = spell.is_aoe || false;
    const { level: damageLevel, extraPips } = calcSpellDamage(cost, isAoe);

    const attackBlock = success ? (isAoe ? `
<div class="kk9-attack-actions" style="padding:6px 10px;border-top:1px solid var(--border,#2a2a2a);display:flex;gap:5px;flex-wrap:wrap">
  <button class="kk9-apply-damage" data-weapon-id="${spellItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${damageLevel}" data-damage-type="${spell.damage_type}" data-extra-pip="${extraPips}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${spell.status_uuid||""}" data-is-gear="1" data-is-spell="1" style="background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);border-radius:3px;color:#a855f7;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Засчитать урон (все цели)</button>
  <button class="kk9-miss" style="background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Промах</button>
</div>` : `
<div class="kk9-attack-actions" style="padding:6px 10px;border-top:1px solid var(--border,#2a2a2a);display:flex;gap:5px;flex-wrap:wrap">
  <select id="kk9-target-select-${spellItem.id}" style="flex:1;min-width:120px;background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text,#b8b0a4);padding:2px 6px;font-size:0.8em;font-family:'Jost',sans-serif">
    <option value="">— выбери цель —</option>${targetOptions}
  </select>
  <button class="kk9-apply-damage" data-weapon-id="${spellItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${damageLevel}" data-damage-type="${spell.damage_type}" data-extra-pip="${extraPips}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${spell.status_uuid||""}" data-is-spell="1" style="background:rgba(168,85,247,0.15);border:1px solid rgba(168,85,247,0.4);border-radius:3px;color:#a855f7;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Засчитать урон${extraPips ? ` +${extraPips} пип` : ""}</button>
  <button class="kk9-resist-roll" data-weapon-id="${spellItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${damageLevel}" data-damage-type="${spell.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${spell.status_uuid||""}" style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:3px;color:#4ade80;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Стойкость</button>
  <button class="kk9-miss" style="background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Промах</button>
</div>`) : `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;padding:4px 10px;border-top:1px solid var(--border,#2a2a2a)">Заклинание не попало. Энергия потрачена.</div>`;

    const baseContent  = interceptedContent ?? "";
    // Вставляем кнопки атаки внутрь kk9-chat-roll перед последним закрывающим тегом
    const lastClose = baseContent.lastIndexOf("</div>");
    const finalContent = lastClose >= 0
      ? baseContent.slice(0, lastClose) + attackBlock + baseContent.slice(lastClose)
      : baseContent + attackBlock;

    await ChatMessage.create({
      speaker: interceptedSpeaker ?? ChatMessage.getSpeaker({ actor }),
      content: finalContent,
      flags:   { kk9: { isRoll: true, actorId: actor?.id } }
    });

  } else {
    const stMods = actor ? collectStatusModifiers(actor, {
      attributeKey: null, itemType: "spell",
      skillUuid: null, isToughness: false, isInitiative: false,
    }) : { dieMod:0, numericMod:0, successMod:0, extraDice:[], reasons:[], usedIds:[] };

    const itemMod  = spell.modifier || 0;
    const totalMod = itemMod + stMods.numericMod;
    const modStr   = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : "";
    const isWC     = actor?.type === "character";

    let baseDie = 4;
    if (stMods.dieMod !== 0) baseDie = shiftDie(baseDie, stMods.dieMod);
    const formula = isWC ? `{1d${baseDie}x-2${modStr}, 1d6x-2${modStr}}kh` : `1d${baseDie}x-2${modStr}`;
    const roll    = new Roll(formula);
    await roll.evaluate();
    if (actor && stMods.usedIds.length) await consumeStatusCharges(actor, stMods.usedIds);

    // Доп. кубики от статусов
    let extraDieTotal = 0;
    const allReasons  = [];
    if (itemMod !== 0) allReasons.push(`${spellItem.name}: ${itemMod > 0 ? "+" : ""}${itemMod}`);
    allReasons.push(...stMods.reasons.filter(r => !r.includes("доп.")));
    for (const ed of (stMods.extraDice ?? [])) {
      const sign      = ed.mode === "add" ? 1 : -1;
      const extraRoll = new Roll(`1d${ed.faces}`);
      await extraRoll.evaluate();
      extraDieTotal += sign * extraRoll.total;
      const signStr  = sign > 0 ? `+1d${ed.faces} = +${extraRoll.total}` : `-1d${ed.faces} = −${extraRoll.total}`;
      allReasons.push(`${ed.name ?? "Статус"}: ${signStr}`);
    }

    const rollTotal = roll.total + extraDieTotal;
    const degree    = (() => {
      if (rollTotal <= 0) return { type:"snake_eyes", label:"Глаза змеи", successes: 0 };
      if (rollTotal < 4)  return { type:"failure",    label:"Неудача",     successes: 0 };
      const s = 1 + Math.floor((rollTotal - 4) / 4);
      return { type:"success", label: s===1?"1 успех":s<=4?`${s} успеха`:`${s} успехов`, successes: s };
    })();

    if (stMods.successMod !== 0 && degree.type === "success") {
      degree.successes = Math.max(0, degree.successes + stMods.successMod);
      const s = degree.successes;
      degree.label = s===1?"1 успех":s<=4?`${s} успеха`:`${s} успехов`;
    }
    const success = degree.type === "success";

    const resultClass = {snake_eyes:"kk9-result-snake",failure:"kk9-result-failure",success:"kk9-result-success"}[degree.type];
    const portrait    = actor?.img || "icons/svg/mystery-man.svg";
    const fColors     = {white:"#e8e8e8",black:"#888888",blue:"#3b82f6",green:"#22c55e",purple:"#a855f7",red:"#ef4444",brown:"#92400e",mercury:"#94a3b8",invisible:"#6b7280"};
    const fKey        = actor?.system?.faculty_key || actor?.system?.faculty;
    const accent      = (fKey && fKey!=="none") ? (fColors[fKey]||"#a855f7") : "#a855f7";
    const diceHtml    = _renderAttackDiceHtmlWithTotal(roll, allReasons, rollTotal);

    const content = `<div class="kk9-chat-roll kk9-attack-roll" data-result-type="${degree.type}" style="--accent:${accent}">
  <div class="kk9-chat-header">
    <img class="kk9-chat-portrait" src="${portrait}" alt="${actor?.name??""}">
    <div class="kk9-chat-header-text">
      <span class="kk9-chat-name">${actor?.name??""}</span>
      <span class="kk9-chat-label">${spellItem.name} — заклинание</span>
    </div>
  </div>
  <div class="kk9-attack-meta" style="font-size:0.76em;color:var(--text-dim,#6a6560);padding:0 10px 4px">без навыка · ${dmgLabel} · ${typeLabel} · −${cost} энергии</div>
  <details class="kk9-result-details">
    <summary class="kk9-result-summary ${resultClass}"><span class="kk9-result-text">${degree.label}</span></summary>
    ${diceHtml}
  </details>
  ${success ? `<div class="kk9-attack-actions" style="padding:6px 10px;border-top:1px solid var(--border,#2a2a2a);display:flex;gap:5px;flex-wrap:wrap">
    <select id="kk9-target-select-${spellItem.id}" style="flex:1;min-width:120px;background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text,#b8b0a4);padding:2px 6px;font-size:0.8em;font-family:'Jost',sans-serif"><option value="">— выбери цель —</option>${targetOptions}</select>
    <button class="kk9-apply-damage" data-weapon-id="${spellItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${spell.damage_level}" data-damage-type="${spell.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${spell.status_uuid||""}" style="background:rgba(160,41,30,0.2);border:1px solid rgba(160,41,30,0.4);border-radius:3px;color:#c0392b;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Засчитать урон</button>
    <button class="kk9-resist-roll" data-weapon-id="${spellItem.id}" data-actor-id="${actor?.id??""}" data-damage-level="${spell.damage_level}" data-damage-type="${spell.damage_type}" data-has-status="${hasStatus?"1":"0"}" data-status-uuid="${spell.status_uuid||""}" style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:3px;color:#4ade80;padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Стойкость</button>
    <button class="kk9-miss" style="background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer">Промах</button>
  </div>` : `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;padding:4px 10px;border-top:1px solid var(--border,#2a2a2a)">Заклинание не попало. Энергия потрачена.</div>`}
</div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor:  `${spellItem.name} — заклинание`,
      content,
      flags:   { kk9: { isRoll: true, actorId: actor?.id } }
    });
  }
}




// ── Список кандидатов: combat → сцена → мир ────────────────
function _getTargetCandidates(excludeActorId = null) {
  const TYPES = ["character","npc-light","npc-hard","npc-boss","container","daemon","companion"];

  // Фильтр: даймон-шарик не является целью
  const _isValidTarget = (actor) => {
    if (!actor) return false;
    if (actor.type === "daemon" && actor.system.is_orb === true) return false;
    return true;
  };

  // 1. Активный бой
  if (game.combat?.combatants?.size) {
    const seen = new Set();
    const list = [];
    for (const cb of game.combat.combatants) {
      if (!cb.actor) continue;
      if (cb.actor.id === excludeActorId) continue;
      if (!TYPES.includes(cb.actor.type)) continue;
      if (!_isValidTarget(cb.actor)) continue;
      if (seen.has(cb.actor.id)) continue;
      seen.add(cb.actor.id);
      list.push({ id: cb.actor.id, name: `${cb.name} (бой)` });
    }
    if (list.length) return list;
  }

  // 2. Токены на сцене
  const scene = game.scenes?.active;
  if (scene?.tokens?.size) {
    const seen = new Set();
    const list = [];
    for (const t of scene.tokens) {
      if (!t.actor) continue;
      if (t.actor.id === excludeActorId) continue;
      if (!TYPES.includes(t.actor.type)) continue;
      if (!_isValidTarget(t.actor)) continue;
      if (seen.has(t.actor.id)) continue;
      seen.add(t.actor.id);
      list.push({ id: t.actor.id, name: `${t.name} (сцена)` });
    }
    if (list.length) return list;
  }

  // 3. Все акторы мира
  return game.actors
    .filter(a => TYPES.includes(a.type) && a.id !== excludeActorId && _isValidTarget(a))
    .map(a => ({ id: a.id, name: a.name }));
}

// ── Модалка выбора целей (площадные / gear) — только GM ────
async function _showAoeTargetDialog(damageLevel, damageType, extraPip, hasStatus, statusUuid, actorId) {
  if (!game.user.isGM) { ui.notifications.warn("Выбор целей доступен только ГМ."); return false; }

  const all = _getTargetCandidates(null);
  if (!all.length) { ui.notifications.warn("Нет доступных целей."); return false; }

  const dmgLabel  = { light:"Лёгкий", heavy:"Тяжёлый", lethal:"Летальный" }[damageLevel] || damageLevel;
  const typeLabel = damageType === "mental" ? "Ментальный" : "Физический";

  // Строим строки — все отмечены кроме кастующего
  const rows = all.map(c => `
    <div class="kk9-aoe-row" data-id="${c.id}" style="
      display:flex;align-items:center;gap:10px;padding:7px 10px;
      background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;
      cursor:pointer;user-select:none;margin-bottom:4px;transition:border-color 0.1s,background 0.1s;">
      <input type="checkbox" name="target" value="${c.id}"
        ${c.id !== actorId ? "checked" : ""}
        style="display:none">
      <span style="font-size:0.85em;color:#b8b0a4">${c.name}</span>
    </div>`
  ).join("");

  return new Promise(resolve => {
    new Dialog({
      title: "Площадной урон — выбор целей",
      content: `<div style="font-family:'Jost',sans-serif;padding:4px 2px">
        <div style="font-size:0.78em;color:#6a6560;margin-bottom:10px;padding:4px 8px;background:#1e1e1e;border-radius:3px">
          ${dmgLabel} · ${typeLabel}${extraPip ? ` · +${extraPip} пип` : ""}${hasStatus ? " · статус" : ""}
        </div>
        <div style="display:flex;flex-direction:column;max-height:280px;overflow-y:auto">
          ${rows}
        </div>
      </div>`,
      buttons: {
        apply: {
          label: "Засчитать урон",
          callback: async (html) => {
            // Foundry v13 — читаем через native querySelectorAll
            const checked = html[0].querySelectorAll("input[name=target]:checked");
            const selected = [...checked].map(el => el.value);
            if (!selected.length) { ui.notifications.warn("Не выбрано ни одной цели."); resolve(false); return; }
            for (const id of selected) {
              const t = game.actors.get(id);
              if (!t) continue;
              const res = await applyDamageToActor(t, damageLevel, damageType, true);
              const { newVal } = res;
              for (let p = 0; p < extraPip; p++) await applyDamageToActor(t, "light", damageType, false);
              if (hasStatus && statusUuid) {
                const si = await fromUuid(statusUuid);
                if (si) await applyStatusToActor(t, si);
              }
              ChatMessage.create({
                content: `<div class="kk9-chat-roll" style="--accent:#a855f7">
                  <div class="kk9-chat-header">
                    <div class="kk9-chat-header-text" style="padding:5px 10px">
                      <span class="kk9-chat-name">${t.name}</span>
                      <span class="kk9-chat-label">${_damageResultLabel(t, newVal, damageType, res?.isBoss, hasStatus, statusUuid)}</span>
                    </div>
                  </div>
                </div>`,
                speaker: ChatMessage.getSpeaker({ alias: "Система" }),
                flags: { kk9: { isRoll: true } }
              });
            }
            resolve(true);
          }
        },
        cancel: { label: "Отмена", callback: () => resolve(false) }
      },
      default: "apply",
      render: (html) => {
        const $dialog = html.closest(".app.dialog");
        $dialog.css("background", "#1c1c1c");
        $dialog.find(".window-content").css("background", "#1c1c1c");
        // Стили кнопок
        $dialog.find(".dialog-button").css({
          background:"#2a2a2a", border:"1px solid #3a3a3a",
          "border-radius":"4px", color:"#b8b0a4",
          "font-family":"'Jost',sans-serif", "font-size":"0.85em",
          padding:"6px 14px", cursor:"pointer"
        });
        $dialog.find(".dialog-button[data-button='apply']").css({ "border-color":"#c4a44a", color:"#c4a44a" });
        // Клик по строке — тогл чекбокса
        html.find(".kk9-aoe-row").on("click", function(e) {
          if (e.target.type === "checkbox") return;
          const $cb = $(this).find("input[type=checkbox]");
          $cb.prop("checked", !$cb.prop("checked"));
          $(this).css("border-color", $cb.prop("checked") ? "#c4a44a" : "#3a3a3a");
        });
        // Инит подсветки уже отмеченных
        html.find(".kk9-aoe-row").each(function() {
          const $cb = $(this).find("input[type=checkbox]");
          if ($cb.prop("checked")) $(this).css("border-color", "#c4a44a");
        });
      }
    }, { width: 340, classes: ["dialog", "kk9-dialog"] }).render(true);
  });
}


// ============================================================
// ОБРАБОТЧИКИ КНОПОК В ЧАТЕ
// ============================================================
export function registerChatListeners() {
  $(document).on("click", ".kk9-apply-damage", async function() {
    await _handleApplyDamage($(this));
  });
  $(document).on("click", ".kk9-resist-roll", async function() {
    await _handleResistRoll($(this));
  });
  $(document).on("click", ".kk9-miss", function() {
    const $msg = $(this).closest(".kk9-attack-msg");
    $msg.find("select, button").prop("disabled", true).css("opacity", "0.4");
    $(this).closest("div").after(
      `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;margin-top:4px">Промах — урон не засчитан.</div>`
    );
  });
}

async function _getTargetActor(btn) {
  const weaponId = btn.data("weapon-id");
  const $msg     = btn.closest(".kk9-attack-msg, .kk9-chat-roll, .kk9-attack-roll, .chat-message");
  const targetId = $msg.find(`#kk9-target-select-${weaponId}`).val();
  if (!targetId) { ui.notifications.warn("Выбери цель."); return null; }
  return game.actors.get(targetId);
}

async function _handleApplyDamage(btn) {
  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const extraPip    = parseInt(btn.data("extra-pip") || 0);
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");
  const isAoe       = btn.data("is-gear") === "1" || btn.data("is-gear") === 1;

  if (isAoe) {
    const actorId = btn.data("actor-id") ?? "";
    await _showAoeTargetDialog(damageLevel, damageType, extraPip, hasStatus, statusUuid, actorId);
    btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
    return;
  }

  const target = await _getTargetActor(btn);
  if (!target) return;

  const result = await applyDamageToActor(target, damageLevel, damageType, false);
  const { newVal } = result;
  for (let p = 0; p < extraPip; p++) await applyDamageToActor(target, "light", damageType, false);

  if (hasStatus && statusUuid) {
    const statusItem = await fromUuid(statusUuid);
    if (statusItem) await applyStatusToActor(target, statusItem);
  }

  ChatMessage.create({
    content: `<div class="kk9-chat-roll" style="--accent:#c0392b">
      <div class="kk9-chat-header">
        <div class="kk9-chat-header-text" style="padding:5px 10px">
          <span class="kk9-chat-name">${target.name}</span>
          <span class="kk9-chat-label">урон · ${damageType === "mental" ? "Ментал." : "Физич."}: ${newVal}/5${hasStatus && statusUuid ? " · статус" : ""}</span>
        </div>
      </div>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: "Система" }),
    flags: { kk9: { isRoll: true } }
  });

  btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
}

async function _handleResistRoll(btn) {
  const target = await _getTargetActor(btn);
  if (!target) return;

  const spiritDie = target.system.attributes?.spirit?.die || 4;
  const isWC      = target.type === "character";
  const formula   = isWC ? `{1d${spiritDie}, 1d6}kh` : `1d${spiritDie}`;
  const roll      = new Roll(formula);
  await roll.evaluate();

  const success     = roll.total >= 4;
  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    flavor:  `${target.name} — Стойкость (сопротивление)`
  });

  if (!success) {
    const resistResult = await applyDamageToActor(target, damageLevel, damageType, false);
    const { newVal } = resistResult;
    if (hasStatus && statusUuid) {
      const statusItem = await fromUuid(statusUuid);
      if (statusItem) await applyStatusToActor(target, statusItem);
    }
    ChatMessage.create({
      content: `<div class="kk9-chat-roll" style="--accent:#c0392b">
        <div class="kk9-chat-header">
          <div class="kk9-chat-header-text" style="padding:5px 10px">
            <span class="kk9-chat-name">${target.name}</span>
            <span class="kk9-chat-label">провалил стойкость · ${_damageResultLabel(target, newVal, damageType, resistResult?.isBoss, hasStatus, statusUuid)}</span>
          </div>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: "Система" }),
      flags: { kk9: { isRoll: true } }
    });
  } else {
    ChatMessage.create({
      content: `<div class="kk9-chat-roll" style="--accent:#4ade80">
        <div class="kk9-chat-header">
          <div class="kk9-chat-header-text" style="padding:5px 10px">
            <span class="kk9-chat-name">${target.name}</span>
            <span class="kk9-chat-label">устоял — урон не засчитан</span>
          </div>
        </div>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: "Система" }),
      flags: { kk9: { isRoll: true } }
    });
  }

  btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
}
