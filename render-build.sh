#!/bin/bash
set -x
echo "=== Node version ==="
node --version
echo "=== Memory info ==="
cat /proc/meminfo | head -5 || true
echo "=== Running next build ==="
npx next build --webpack --experimental-debug-memory-usage 2>&1
EXIT_CODE=$?
echo "=== next build exited with code: $EXIT_CODE ==="
if [ $EXIT_CODE -ne 0 ]; then
  echo "=== Checking for core dump ==="
  ls -la /tmp/core* 2>/dev/null || echo "No core dumps found"
  echo "=== dmesg (last 20 lines) ==="
  dmesg | tail -20 2>/dev/null || echo "dmesg not available"
fi
exit $EXIT_CODE
