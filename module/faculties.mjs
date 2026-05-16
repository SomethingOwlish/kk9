// ============================================================
// КК9 — Определения факультетов
// ============================================================

export const FACULTIES = {
  white: {
    label: "Белый",
    color: "#e8e8e8",
    teacher: "Белый",
    skills: [
      { name: "Пытки",           die: 4, linkedAttribute: "spirit"   },
      { name: "Тактика",         die: 4, linkedAttribute: "smarts"   },
      { name: "Стратегия",       die: 4, linkedAttribute: "smarts"   },
      { name: "Владение мечом",  die: 4, linkedAttribute: "agility"  }
    ]
  },
  black: {
    label: "Чёрный",
    color: "#444444",
    teacher: "Чёрный",
    skills: [
      { name: "Выслеживание",            die: 4, linkedAttribute: "smarts"  },
      { name: "Скрытность",              die: 4, linkedAttribute: "agility" },
      { name: "Противостояние пыткам",   die: 4, linkedAttribute: "vigor"   },
      { name: "Убийство",                die: 4, linkedAttribute: "agility" }
    ]
  },
  blue: {
    label: "Синий",
    color: "#3b82f6",
    teacher: "Синий",
    skills: [
      { name: "Соблазнение", die: 4, linkedAttribute: "spirit"  },
      { name: "Уговоры",     die: 4, linkedAttribute: "spirit"  },
      { name: "Запугивание", die: 4, linkedAttribute: "spirit"  },
      { name: "Скрытность",  die: 4, linkedAttribute: "agility" }
    ]
  },
  green: {
    label: "Зелёный",
    color: "#22c55e",
    teacher: "Зелёный",
    skills: [
      { name: "Яды",           die: 4, linkedAttribute: "smarts" },
      { name: "Противоядия",   die: 4, linkedAttribute: "smarts" },
      { name: "Исцеление",     die: 4, linkedAttribute: "spirit" }
    ]
  },
  purple: {
    label: "Фиолетовый",
    color: "#a855f7",
    teacher: "Фиолетовый",
    skills: [
      { name: "Палочковая магия", die: 4, linkedAttribute: "smarts" },
      { name: "Концентрация",     die: 4, linkedAttribute: "spirit" },
      { name: "Зельеварение",     die: 4, linkedAttribute: "smarts" },
      { name: "Руны",             die: 4, linkedAttribute: "smarts" },
      { name: "Даймонология",     die: 4, linkedAttribute: "spirit" }
    ]
  },
  red: {
    label: "Красный",
    color: "#ef4444",
    teacher: "Красный",
    skills: [
      { name: "Аналитика",       die: 4, linkedAttribute: "smarts" },
      { name: "Прорицание",      die: 4, linkedAttribute: "spirit" },
      { name: "Тактика",         die: 4, linkedAttribute: "smarts" },
      { name: "Наблюдательность",die: 4, linkedAttribute: "smarts" }
    ]
  },
  brown: {
    label: "Бурый",
    color: "#92400e",
    teacher: "Бурый",
    skills: [
      { name: "Владение оружием ближнего боя",    die: 4, linkedAttribute: "strength" },
      { name: "Стрельба",                          die: 4, linkedAttribute: "agility"  },
      { name: "Стрельба из автоматического оружия",die: 4, linkedAttribute: "agility"  },
      { name: "Выживание",                         die: 4, linkedAttribute: "smarts"   }
    ]
  },
  mercury: {
    label: "Ртутный",
    color: "#94a3b8",
    teacher: "Ртутный",
    skills: [
      { name: "Починка",          die: 4, linkedAttribute: "smarts" },
      { name: "Взлом техники",    die: 4, linkedAttribute: "smarts" },
      { name: "Управление дроном",die: 4, linkedAttribute: "agility" }
    ]
  },
  invisible: {
    label: "Незримый",
    color: "#6b7280",
    teacher: "Незримый",
    skills: [
      { name: "Бытие бесполезным мудаком", die: 4, linkedAttribute: "spirit" }
    ]
  }
};
