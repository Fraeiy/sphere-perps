import { Decimal } from '@prisma/client/runtime/library';

export const D = (value: number | string | Decimal): Decimal =>
  value instanceof Decimal ? value : new Decimal(value);

export const toNumber = (value: Decimal | number | string): number =>
  value instanceof Decimal ? value.toNumber() : Number(value);

export const formatUsd = (value: number | Decimal): string => {
  const n = toNumber(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};