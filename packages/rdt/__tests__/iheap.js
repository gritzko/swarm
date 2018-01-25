// @flow

import IHeap, {eventComparator, eventComparatorDesc, refComparator} from '../src/iheap';
import Op, {ZERO, Frame} from '../../ron/src';

test('IHeap put frame', () => {
  const frameA = "*lww#test@time1-orig:number=1@(2:string'2'";
  const frameB = "*lww#test@time3-orig:number=3@(4:string'4'";
  const frameC = "*lww#test@time1-orig:number=1@(2:string'2'@(3:number=3@(4:string'4'";

  const heap = new IHeap(eventComparator);

  heap.put(new Frame(frameA));
  heap.put(new Frame(frameB));

  expect(heap.frame().toString()).toBe(frameC);
});

test('IHeap op', () => {
  const frames = [
    "*lww#test@time1-orig:number=1@(2:string'2'",
    "*lww#test@time3-orig:number=3@(4:string'4'",
    "*lww#test@time2-orig:number=2@(2:string'2'@(3:number=3@(4:string'4'",
  ];

  const heap = new IHeap(refComparator);
  heap.putAll(frames.map(i => new Frame(i)));
  // $FlowFixMe
  const loc = heap.current().op.uuid(3);
  let count = 0;

  while (
    // $FlowFixMe
    heap
      .current()
      .op.uuid(3)
      .eq(loc)
  ) {
    count++;
    heap.next();
  }
  expect(count).toBe(3);
});

test('IHeap merge', () => {
  const frameA = "*rga#test@1:0'A'@2'B'"; //  D E A C B
  const frameB = "*rga#test@1:0'A'@3'C'";
  const frameC = "*rga#test@4:0'D'@5'E'";
  const frameR = "*rga#test@4'D'@5'E'@1'A'@3'C'@2'B'";
  const heap = new IHeap(eventComparatorDesc, refComparator);
  heap.put(new Frame(frameA));
  heap.put(new Frame(frameB));
  heap.put(new Frame(frameC));
  const res = new Frame();
  while (!heap.eof()) {
    const current = heap.current();
    if (!current) break;
    const op = current.op || ZERO;
    res.push(op);
    heap.nextPrim();
  }
  expect(res.toString()).toBe(frameR);
});
