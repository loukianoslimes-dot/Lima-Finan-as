
export const formatCurrencyParts = (value: number) => {
  try {
    const parts = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).formatToParts(value);
    
    const symbol = parts.find(p => p.type === 'currency')?.value || "R$";
    const amount = parts.filter(p => p.type !== 'currency').map(p => p.value).join('').trim();
    return { symbol, amount };
  } catch (e) {
    return { symbol: "R$", amount: value.toFixed(2).replace('.', ',') };
  }
};

export const generateId = () => {
  // Fallback for environments where crypto.randomUUID is not available
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const addMonths = (date: Date, months: number) => {
  const d = new Date(date);
  const desiredDay = d.getDate();
  d.setMonth(d.getMonth() + months);
  // If the day changed, it means we overflowed (e.g. Jan 31 -> Feb 28/29)
  if (d.getDate() !== desiredDay) {
    d.setDate(0);
  }
  return d;
};

export const addYears = (date: Date, years: number) => {
  const d = new Date(date);
  const desiredDay = d.getDate();
  const desiredMonth = d.getMonth();
  d.setFullYear(d.getFullYear() + years);
  // Handle Feb 29 in leap years
  if (d.getMonth() !== desiredMonth) {
    d.setDate(0);
  }
  return d;
};

export const formatDateToISO = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
