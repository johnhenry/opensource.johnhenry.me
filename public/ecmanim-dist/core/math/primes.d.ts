/** Sieve of Eratosthenes: Uint8Array of length n+1, 1 = prime. */
export declare function sieve(n: number): Uint8Array;
/** All primes ≤ n, ascending. */
export declare function primesUpTo(n: number): number[];
/** Trial-division primality (fine for one-off checks; use sieve for ranges). */
export declare function isPrime(n: number): boolean;
/**
 * Eigen-decomposition of a REAL 2x2 matrix [[a, b], [c, d]] (3b1b
 * eigenvector visual). Returns real eigenpairs only (empty array when the
 * eigenvalues are complex); each vector is unit length with a stable sign
 * convention (largest-magnitude component positive).
 */
export declare function eigen2x2(m: [[number, number], [number, number]]): Array<{
    value: number;
    vector: [number, number];
}>;
//# sourceMappingURL=primes.d.ts.map