export default {
  test: { environment: 'node', include: ['server/**/*.test.ts'], testTimeout: 10000, hookTimeout: 10000, pool: 'threads' },
}
