// @flow

import { Frame, Batch } from '../src';

test('Batch.splitByID', () => {
  const str =
    '*set#mice@1YKBhBDz01+1YKBfD?*#@!@>mouse$1YKBfD@[9:1YKBfD4x01+1YKBfD,@(du8G01(Up:0>mouse$1YKBUp@(WS:1YKBUp6H01+1YKBUp,@(Tw4Q01(Tw4:0>mouse$1YKBTw4@[_8r01[_>mouse$1YKBT_@[Y(S8U:1YKBS8Ea01+1YKBS8U,@(S0E_01[0T:0>mouse$1YKBS0T@(RwB901(Rw>mouse$1YKBRw@(QPFP01(QPQ>mouse$1YKBQPQ@[O4B01[O>mouse$1YKBQO@(OrAJ01(OrI>mouse$1YKBOrI@[pE401[p>mouse$1YKBOp@(MS1T01(MR>mouse$1YKBMR@(EREx01(ERW>mouse$1YKBERW@[L0v01[L0K>mouse$1YKBEL0K@[D1f01[CZ>mouse$1YKBECZ@[BCz01[B>mouse$1YKBEB@(D93B01(D9>mouse$1YKBD9@[L4901(Af:1YKBAg3~01+1YKBAf,@(AJ(8T:(8T2S01(8T,@(7R(4e:(4e9a01(4e,@(0O+1YKAQ5:1YKAtmEq01+1YKAQ5,@1YKAsB+:(qq2X01,@(hC:(e64801,@(YZ:(WSE~01,@(Ut:(T_Cx01,@(S4:(Q5AZ01,@(OT(NK:(NK5l01(NK,@(N2(LJB:(LJ6J01(LJB,@(LG2T01[G:0>mouse$1YKALG@(KK5501(KK>mouse$1YKAKK@(Js2m01(Jr>mouse$1YKAJr@(GbBg01(GbL>mouse$1YKAGbL@[E0601+1YK7WoK>mouse$1YK7WoK@[1:1YKAE20S01+1YK7WoK,@1YK8qM+:1YK7fr8w01+,@1YK7as+:(WoCT01,@(Wa2T01(Rl:0>mouse$1YK7Rl@(Tj:1YK7Rl5C01+1YK7Rl,@(Rj(QY_:(QZ2701(QY_,@(QD8g01[DG:0>mouse$1YK7QDG@[26R01[2>mouse$1YK7Q2@(P(OwY>mouse$1YK7OwY@(Or2J01[r2>mouse$1YK7Or2@(Nj3x01(Nj3>mouse$1YK7Nj3@(LZ3D01(LZ>mouse$1YK7LZ@(Nc8N01:1YK7KD3M01+1YK7KD,@)2:(Jh0t01(JgZ,@)3:[J4n01[J,';
  const res = Batch.splitByID(str);
  expect(res.frames).toHaveLength(1);

  const b = [];
  const original = [];
  for (const op of res.frames[0]) {
    b.push(op.toString());
  }

  for (const op of new Frame(str)) {
    original.push(op.toString());
  }

  expect(b).toEqual(original);

  // console.log(JSON.stringify(b, null, 2));
  // console.log(JSON.stringify(original, null, 2));
});
