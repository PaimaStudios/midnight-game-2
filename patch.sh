#!/usr/bin/env bash
#
# Post-install patches for dust-to-dust (bun + effectstream).
#
# Run automatically via the root `postinstall` script. Idempotent — safe to
# re-run; already-patched files are skipped.
#
# --- @seriousme/opifex (MQTT engine) socket-close fix ---
# The effectstream node embeds an in-process MQTT broker/client (opifex). Under
# bun, `WritableStreamDefaultWriter.close()` on an already-closed/errored stream
# REJECTS asynchronously instead of throwing synchronously, so opifex's
# synchronous `try { this.writer.close() } catch {}` never sees it. The escaped
# rejection is fatal — effection's main() tears the node down (exit 1) — and the
# node crash-loops on every MQTT reconnect (right after the first block-merge).
# Wrap the call so the async rejection is swallowed.
#
# Midnight-only game: no hardhat/fetch-blob/EVM patches needed.

set -euo pipefail

echo "🔧 Applying post-install patches..."

OLD='                this.writer.close();'
NEW='                Promise.resolve(this.writer.close()).catch(() => {});'

patch_opifex_socket() {
    local f="$1"
    [[ -f "$f" ]] || return 0
    if grep -qF "$NEW" "$f"; then
        echo "✅ opifex socket.js already patched: $f"
        return 0
    fi
    if grep -qF "$OLD" "$f"; then
        # literal, indentation-sensitive replacement via python (no regex escaping)
        python3 - "$f" "$OLD" "$NEW" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as fh:
    content = fh.read()
with open(path, "w") as fh:
    fh.write(content.replace(old, new))
PY
        echo "✅ Patched opifex socket.js: $f"
    else
        echo "⚠️  opifex socket.js: expected line not found (upstream changed?): $f"
    fi
}

shopt -s nullglob
matched=0
for f in \
    ./node_modules/.bun/@seriousme+opifex@*/node_modules/@seriousme/opifex/dist/socket/socket.js \
    ./node_modules/@seriousme/opifex/dist/socket/socket.js ; do
    patch_opifex_socket "$f"
    matched=1
done
shopt -u nullglob

if [[ "$matched" -eq 0 ]]; then
    echo "⚠️  No @seriousme/opifex install found to patch (skipping)."
fi

echo "✅ Post-install patches complete."
