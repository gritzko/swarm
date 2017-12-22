// @flow
'use strict';

let iota = 0;
export const IS_OP_BASED = 1 << iota++;
export const IS_STATE_BASED = 1 << iota++;
export const IS_PATCH_BASED = 1 << iota++;
export const IS_VV_DIFF = 1 << iota++;
export const IS_OMNIVOROUS = 1 << iota++;
export const IS_IDEMPOTENT = 1 << iota++;
