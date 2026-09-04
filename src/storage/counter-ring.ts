// Copyright (C) 2026, Stichting Mapcode Foundation (http://www.mapcode.com)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// ---------------------------------------------------------------------------
// CounterRing — fixed-width time buckets in a ring. An event increments the
// bucket its ts falls in; a trailing-window count sums the buckets that
// overlap the window. Because the event log is append-only, a past bucket
// never changes, so incremental adds and a periodic rebuild from a scan
// converge on the same numbers.
// ---------------------------------------------------------------------------

export class CounterRing {
  private readonly counts: Uint32Array;
  /** Bucket id held by each slot; -1 = empty. */
  private readonly ids: Int32Array;

  constructor(
    readonly widthSeconds: number,
    readonly slots: number
  ) {
    this.counts = new Uint32Array(slots);
    this.ids = new Int32Array(slots).fill(-1);
  }

  private bucketOf(ts: number): number {
    return Math.floor(ts / this.widthSeconds);
  }

  /**
   * Add n events at ts. A newer bucket landing on a slot evicts the older
   * one (it has aged past the horizon); an older event than the slot holds is
   * beyond the horizon and ignored. Hence order-independent.
   * ts is a non-negative epoch second (negative values are ignored); bucket ids must fit Int32 — true for int4 epoch seconds.
   */
  add(ts: number, n = 1): void {
    if (ts < 0) return;
    const bucket = this.bucketOf(ts);
    const slot = bucket % this.slots;
    const held = this.ids[slot];
    if (held === bucket) {
      this.counts[slot] += n;
    } else if (held < bucket) {
      this.ids[slot] = bucket;
      this.counts[slot] = n;
    }
  }

  /** Sum of buckets floor(fromTs/w) .. floor(toTs/w) inclusive (align-down at the lower edge). */
  count(fromTs: number, toTs: number): number {
    const lo = this.bucketOf(fromTs);
    const hi = this.bucketOf(toTs);
    let total = 0;
    for (let i = 0; i < this.slots; i++) {
      const id = this.ids[i];
      if (id >= lo && id <= hi) total += this.counts[i];
    }
    return total;
  }
}
