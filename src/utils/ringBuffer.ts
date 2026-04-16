// Fixed-size circular buffer over a Float32Array. Each push overwrites the
// oldest sample. Reads return a copy in chronological order — most callers
// only need the backing array + head for zero-copy consumption.
export class RingBuffer {
  readonly capacity: number;
  readonly data: Float32Array;
  size = 0;
  head = 0; // next write index

  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity);
  }

  push(v: number) {
    this.data[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  // Copy samples out in oldest→newest order into `out`. Returns the number
  // of samples actually written.
  copyTo(out: Float32Array): number {
    const n = this.size;
    const start = (this.head - n + this.capacity) % this.capacity;
    if (start + n <= this.capacity) {
      out.set(this.data.subarray(start, start + n));
    } else {
      const first = this.capacity - start;
      out.set(this.data.subarray(start), 0);
      out.set(this.data.subarray(0, n - first), first);
    }
    return n;
  }

  clear() {
    this.size = 0;
    this.head = 0;
  }
}
