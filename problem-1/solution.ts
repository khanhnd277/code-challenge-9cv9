// Time: O(1) | Space: O(1)
function sum_to_n_a(n: number): number {
  return n * (n + 1) / 2;
}

// Time: O(n) | Space: O(1)
function sum_to_n_b(n: number): number {
  let sum: number = 0;
  for (let i = 1; i <= n; i++) {
    sum += i;
  }
  return sum;
}

// Time: O(n) | Space: O(n)
function sum_to_n_c(n: number): number {
  return Array.from({ length: n }, (_, i) => i + 1).reduce((acc, val) => acc + val, 0);
}

console.log('Result of a method: ', sum_to_n_a(100000));
console.log('Result of b method: ', sum_to_n_b(100000));
console.log('Result of c method: ', sum_to_n_c(100000));

