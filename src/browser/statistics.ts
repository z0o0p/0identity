export class OnlineStatistics {
  private sampleCount = 0;
  private mean = 0;
  private squaredDifferenceTotal = 0;

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.sampleCount += 1;
    const difference = value - this.mean;
    this.mean += difference / this.sampleCount;
    this.squaredDifferenceTotal += difference * (value - this.mean);
  }

  coefficientOfVariation(): number {
    if (this.sampleCount < 2 || this.mean <= Number.EPSILON) return 0;
    const standardDeviation = Math.sqrt(this.squaredDifferenceTotal / this.sampleCount);
    return Math.min(5, standardDeviation / this.mean);
  }
}

export function rounded(value: number): number {
  return Number(value.toFixed(3));
}
