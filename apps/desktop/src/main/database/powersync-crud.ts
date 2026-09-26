import type { CrudTransaction } from '@powersync/common';

export interface SerializedCrudOperation extends Record<string, unknown> {
  op: 'PUT' | 'PATCH' | 'DELETE';
  type: string;
  id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSerializedCrudOperation(value: unknown): asserts value is SerializedCrudOperation {
  if (!isRecord(value)) {
    throw new Error('PowerSync CRUD entry serialized to a non-object value');
  }

  if (value.op !== 'PUT' && value.op !== 'PATCH' && value.op !== 'DELETE') {
    throw new Error('PowerSync CRUD entry serialized with an unsupported operation');
  }
  if (typeof value.type !== 'string' || value.type.length === 0) {
    throw new Error('PowerSync CRUD entry serialized without a table type');
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error('PowerSync CRUD entry serialized without a row id');
  }
}

export function serializeCrudTransaction(transaction: CrudTransaction): SerializedCrudOperation[] {
  return transaction.crud.map((entry) => {
    const value = entry.toJSON();
    assertSerializedCrudOperation(value);
    return value;
  });
}
