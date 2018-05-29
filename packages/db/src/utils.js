// @flow

import { UUID, Frame } from '@swarm/ron';
import type { Atom } from '@swarm/ron';
import { calendarBase2Date } from '@swarm/clock';

export function node(
  value: Atom,
  isLeaf: boolean,
  directives: ?{ [string]: { [string]: Atom } } = {},
): Atom {
  if (directives && directives.hasOwnProperty('node')) {
    if (!directives.node && typeof value === 'string') {
      return UUID.fromString(value);
    } else if (directives.node.id instanceof UUID) {
      return directives.node.id;
    } else if (typeof directives.node.id === 'string') {
      return UUID.fromString(directives.node.id);
    }
  } else if (!isLeaf && typeof value === 'string') {
    return UUID.fromString(value);
  }
  return value;
}

export const parseDate = (s: string | UUID): Date => {
  const uuid = s instanceof UUID ? s : UUID.fromString(s);
  return calendarBase2Date(uuid.value);
};

export const applyScalarDirectives = (
  value: Atom,
  directives: {} = {},
): Atom => {
  for (const key of Object.keys(directives || {})) {
    switch (key) {
      case 'date':
        if (typeof value === 'string' || value instanceof UUID)
          value = parseDate(value.toString());
        break;
      case 'uuid':
        if (typeof value === 'string' || value instanceof UUID)
          value = UUID.fromString(value.toString());
        break;
    }
  }
  return value;
};
