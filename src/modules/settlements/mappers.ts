import type { BonusDto, SettlementDto } from "./dto";

// Phase 4.4 — row → DTO mappers for bonuses + settlements.

type SettlementRow = {
  id: number;
  date: string;
  userId: number;
  username: string;
  role: string;
  type: string;
  amount: string;
  paymentMethod: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  applied: boolean;
  appliedInSettlementId: number | null;
};

export function settlementRowToDto(row: SettlementRow): SettlementDto {
  return {
    id: row.id,
    date: row.date,
    userId: row.userId,
    username: row.username,
    role: row.role,
    type: row.type as SettlementDto["type"],
    amount: row.amount,
    paymentMethod: row.paymentMethod,
    notes: row.notes ?? "",
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    applied: row.applied,
    appliedInSettlementId: row.appliedInSettlementId,
  };
}

type BonusRow = {
  id: number;
  date: string;
  userId: number;
  username: string;
  role: string;
  orderId: number;
  deliveryId: number;
  totalBonus: string;
  status: string;
  settlementId: number | null;
  notes: string | null;
};

export function bonusRowToDto(row: BonusRow): BonusDto {
  return {
    id: row.id,
    date: row.date,
    userId: row.userId,
    username: row.username,
    role: row.role,
    orderId: row.orderId,
    deliveryId: row.deliveryId,
    totalBonus: row.totalBonus,
    status: row.status as BonusDto["status"],
    settlementId: row.settlementId,
    notes: row.notes ?? "",
  };
}
