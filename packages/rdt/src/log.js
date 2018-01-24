// @flow
'use strict';

import {Cursor, Frame, UUID} from 'swarm-ron';
import {IS_OP_BASED, IS_PATCH_BASED, IS_OMNIVOROUS} from './is';

/**
 *
 * @param oldStateFrame {Cursor}
 * @param changeFrame {Cursor}
 * @param newStateFrame {Frame}
 */
export default function reduce(
  oldStateFrame: Cursor,
  changeFrame: Cursor,
  newStateFrame: Frame,
) {
  if (oldStateFrame.op && oldStateFrame.op.isHeader()) oldStateFrame.nextOp();
  if (changeFrame.op && changeFrame.op.isHeader()) changeFrame.nextOp();
  while (oldStateFrame.op) {
    newStateFrame.push(oldStateFrame.op);
    oldStateFrame.nextOp();
  }
  while (changeFrame.op) {
    newStateFrame.push(changeFrame.op);
    changeFrame.nextOp();
  }
}

export const TYPE_UUID = UUID.fromString('log');
export const IS = IS_OP_BASED | IS_PATCH_BASED | IS_OMNIVOROUS;
