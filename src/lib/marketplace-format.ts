export function formatMarketplacePrice(cents: number, currency: string) {
  if (cents === 0) return "Free";
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
  const sym = symbols[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export const ORDER_STATUS_LABELS = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  IN_PROGRESS: "In progress",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
} as const;
