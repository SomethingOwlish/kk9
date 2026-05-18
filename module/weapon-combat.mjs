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
export async function applyDamageToActor(actor, damageLevel, damageType) {
  const levels = DAMAGE_LEVELS[damageLevel] || 1;
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

// ── Бросок атаки оружием ────────────────────────────────────
export async function rollWeaponAttack(weaponItem, actor) {
  const weapon = weaponItem.system;

  // Найти навык
  let skillItem = null;
  if (weapon.skill_uuid) {
    skillItem = actor.items.find(i => i.uuid === weapon.skill_uuid || i.id === weapon.skill_uuid);
  }

  // Формула броска
  let formula, skillLabel;
  if (skillItem) {
    const die = skillItem.system.die || 4;
    const mod = skillItem.system.modifier || 0;
    const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : "";
    const isWC = actor.type === "character";
    formula    = isWC ? `{1d${die}${modStr}, 1d6${modStr}}kh` : `1d${die}${modStr}`;
    skillLabel = skillItem.name;
  } else {
    // Анскилд: d4-2
    const isWC = actor.type === "character";
    formula    = isWC ? `{1d4-2, 1d6-2}kh` : `1d4-2`;
    skillLabel = "без навыка";
  }

  const roll = new Roll(formula);
  await roll.evaluate();

  // Цвет сообщения по результату
  const total   = roll.total;
  const success = total >= 4;

  // Список акторов для выбора цели (все кроме атакующего)
  const targetOptions = game.actors
    .filter(a => a.id !== actor.id && ["character","npc-light","npc-hard","npc-boss"].includes(a.type))
    .map(a => `<option value="${a.id}">${a.name}</option>`)
    .join("");

  // Статус-инфо для кнопки
  const hasStatus  = weapon.has_status && weapon.status_uuid;
  const statusInfo = hasStatus
    ? `<span style="font-size:0.82em;color:#c084fc"> + статус: ${weapon.status_name || "?"}</span>`
    : "";

  const dmgLabel = DAMAGE_LABELS[weapon.damage_level] || weapon.damage_level;
  const typeLabel = weapon.damage_type === "mental" ? "🧠 Ментальный" : "⚔ Физический";

  // Сообщение в чат
  const msgContent = `
    <div class="kk9-attack-msg" style="
      font-family:'Jost',sans-serif;
      padding:8px 10px;
      background:var(--bg2,#232323);
      border:1px solid var(--border,#3a3a3a);
      border-left:3px solid ${success ? '#c0392b' : '#6a6560'};
      border-radius:4px;
    ">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <strong style="color:var(--text-head,#d8d0c8)">${actor.name}</strong>
        <span style="color:var(--text-dim,#6a6560);font-size:0.82em">атакует</span>
        <strong style="color:var(--text-head,#d8d0c8)">${weaponItem.name}</strong>
      </div>
      <div style="font-size:0.82em;color:var(--text-dim,#6a6560);margin-bottom:4px">
        Навык: ${skillLabel} · ${dmgLabel} · ${typeLabel}${statusInfo}
      </div>
      <div style="font-size:1.3em;font-family:'Caveat',cursive;color:${success ? '#c4a44a' : '#6a6560'};margin-bottom:8px">
        Результат: ${total} ${success ? '— Попадание!' : '— Промах'}
      </div>

      ${success ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
        <select id="kk9-target-select-${weaponItem.id}" style="
          background:var(--bg3,#2a2a2a);border:1px solid var(--border,#3a3a3a);
          border-radius:3px;color:var(--text,#b8b0a4);padding:2px 6px;font-size:0.82em;
          font-family:'Jost',sans-serif;
        ">
          <option value="">— выбери цель —</option>
          ${targetOptions}
        </select>
        <button class="kk9-apply-damage" data-weapon-id="${weaponItem.id}"
          data-actor-id="${actor.id}"
          data-damage-level="${weapon.damage_level}"
          data-damage-type="${weapon.damage_type}"
          data-has-status="${hasStatus ? '1' : '0'}"
          data-status-uuid="${weapon.status_uuid || ''}"
          style="
            background:rgba(160,41,30,0.2);border:1px solid rgba(160,41,30,0.4);
            border-radius:3px;color:#c0392b;padding:3px 10px;font-family:'Jost',sans-serif;
            font-size:0.78em;cursor:pointer;
          ">✓ Засчитать урон</button>
        <button class="kk9-resist-roll" data-weapon-id="${weaponItem.id}"
          data-actor-id="${actor.id}"
          data-damage-level="${weapon.damage_level}"
          data-damage-type="${weapon.damage_type}"
          data-has-status="${hasStatus ? '1' : '0'}"
          data-status-uuid="${weapon.status_uuid || ''}"
          style="
            background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);
            border-radius:3px;color:#4ade80;padding:3px 10px;font-family:'Jost',sans-serif;
            font-size:0.78em;cursor:pointer;
          ">🛡 Бросок стойкости</button>
        <button class="kk9-miss" style="
            background:rgba(100,100,100,0.1);border:1px solid var(--border,#3a3a3a);
            border-radius:3px;color:var(--text-dim,#6a6560);padding:3px 10px;
            font-family:'Jost',sans-serif;font-size:0.78em;cursor:pointer;
          ">✗ Промах</button>
      </div>
      ` : `
      <div style="font-size:0.8em;color:var(--text-dim,#6a6560);font-style:italic">
        Атака не прошла. Урон не засчитывается.
      </div>
      `}
    </div>`;

  const msg = await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor:  `${weaponItem.name} — атака`,
    content: msgContent
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
    // Просто закрываем / убираем кнопки — помечаем как промах
    const $msg = $(this).closest(".kk9-attack-msg");
    $msg.find("select, button").prop("disabled", true).css("opacity", "0.4");
    $(this).closest("div").after(
      `<div style="font-size:0.78em;color:var(--text-dim,#6a6560);font-style:italic;margin-top:4px">Промах — урон не засчитан.</div>`
    );
  });
}

async function _getTargetActor(btn) {
  const weaponId = btn.data("weapon-id");
  const $msg     = btn.closest(".kk9-attack-msg");
  const targetId = $msg.find(`#kk9-target-select-${weaponId}`).val();
  if (!targetId) { ui.notifications.warn("Выбери цель."); return null; }
  return game.actors.get(targetId);
}

async function _handleApplyDamage(btn) {
  const target = await _getTargetActor(btn);
  if (!target) return;

  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");

  // Применяем урон
  const { newVal } = await applyDamageToActor(target, damageLevel, damageType);

  // Применяем статус если есть
  if (hasStatus && statusUuid) {
    const statusItem = await fromUuid(statusUuid);
    if (statusItem) await applyStatusToActor(target, statusItem);
  }

  // Сообщение в чат
  ChatMessage.create({
    content: `<div style="font-family:'Jost',sans-serif;padding:5px 8px;border-left:3px solid #c0392b;background:var(--bg2,#232323)">
      <strong>${target.name}</strong> получает урон.<br>
      <span style="font-size:0.82em;color:var(--text-dim,#6a6560)">
        ${damageType === "mental" ? "Ментальное" : "Физическое"} состояние: ${newVal}/5
        ${hasStatus && statusUuid ? " · статус применён" : ""}
      </span>
    </div>`,
    speaker: ChatMessage.getSpeaker({ alias: "Система" })
  });

  // Деактивируем кнопки
  btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
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

  const success  = roll.total >= 4;
  const damageLevel = btn.data("damage-level");
  const damageType  = btn.data("damage-type");
  const hasStatus   = btn.data("has-status") === "1" || btn.data("has-status") === 1;
  const statusUuid  = btn.data("status-uuid");

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    flavor:  `${target.name} — Стойкость (сопротивление)`
  });

  if (!success) {
    // Провал — применяем урон и статус
    const { newVal } = await applyDamageToActor(target, damageLevel, damageType);
    if (hasStatus && statusUuid) {
      const statusItem = await fromUuid(statusUuid);
      if (statusItem) await applyStatusToActor(target, statusItem);
    }
    ChatMessage.create({
      content: `<div style="font-family:'Jost',sans-serif;padding:5px 8px;border-left:3px solid #c0392b;background:var(--bg2,#232323)">
        <strong>${target.name}</strong> провалил стойкость — урон засчитан.<br>
        <span style="font-size:0.82em;color:var(--text-dim,#6a6560)">
          ${damageType === "mental" ? "Ментальное" : "Физическое"} состояние: ${newVal}/5
        </span>
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: "Система" })
    });
  } else {
    ChatMessage.create({
      content: `<div style="font-family:'Jost',sans-serif;padding:5px 8px;border-left:3px solid #4ade80;background:var(--bg2,#232323)">
        <strong>${target.name}</strong> устоял — урон не засчитан.
      </div>`,
      speaker: ChatMessage.getSpeaker({ alias: "Система" })
    });
  }

  btn.closest("div").find("button, select").prop("disabled", true).css("opacity", "0.4");
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
          ${STATUS_ICONS[st.status_type] || "⚡"} <strong>${actor.name}</strong>: статус «${st.statusName}» срабатывает
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
            Статус «${st.statusName}» у <strong>${actor.name}</strong> снят (исчерпан).
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
