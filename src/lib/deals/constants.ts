import type { FormaPago, TipoVenta, Operadora } from '@/types';

export const FORMA_PAGO_OPTIONS: FormaPago[] = [
  'Efectivo',
  'Tarjeta de crédito/débito',
  'Transferencia bancaria',
];


export const TIPO_VENTA_OPTIONS: TipoVenta[] = [
  'Línea Nueva',
  'Portabilidad Prepago',
  'Portabilidad Pospago',
  'Migración',
];

export const OPERADORA_OPTIONS: Operadora[] = ['Claro', 'Movistar', 'CNT', 'Tuenti', 'Tigo'];