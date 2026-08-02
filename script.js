const POLL_INTERVAL_MS = 4000

function formatUptime(ms) {
  if (!ms || ms <= 0) return '-'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${sec}s`
}

function formatPosition(pos) {
  if (!pos) return '-'
  return `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`
}

function setStatusBanner(state) {
  const dot = document.getElementById('statusDot')
  const text = document.getElementById('statusText')

  dot.className = 'status-dot ' + state
  if (state === 'online') text.textContent = 'Online'
  else if (state === 'connecting') text.textContent = 'Connecting...'
  else if (state === 'offline') text.textContent = 'Offline'
  else text.textContent = 'Service Offline'
}

async function refresh() {
  try {
    const res = await fetch('/api/status')
    if (!res.ok) throw new Error('bad response')
    const d = await res.json()

    if (d.version) document.getElementById('version').textContent = `v${d.version}`

    setStatusBanner(d.status)
    document.getElementById('health').textContent = d.health ? d.health.toFixed(0) : '0'
    document.getElementById('food').textContent = d.food ? d.food.toFixed(0) : '0'
    document.getElementById('dimension').textContent = d.dimension || '-'
    document.getElementById('position').textContent = formatPosition(d.position)
    document.getElementById('activity').textContent = d.activity || '-'
    document.getElementById('uptime').textContent = formatUptime(d.uptimeMs)
    document.getElementById('ping').textContent = d.ping ? `${d.ping}ms` : '-'
    document.getElementById('memory').textContent = d.memoryMB ? `${d.memoryMB} MB` : '-'
    document.getElementById('deaths').textContent = d.deaths ?? '0'
  } catch (err) {
    // Server unreachable - Railway service is likely stopped
    setStatusBanner('unreachable')
    document.getElementById('health').textContent = '-'
    document.getElementById('food').textContent = '-'
    document.getElementById('dimension').textContent = '-'
    document.getElementById('position').textContent = '-'
    document.getElementById('activity').textContent = '-'
    document.getElementById('uptime').textContent = '-'
    document.getElementById('ping').textContent = '-'
    document.getElementById('memory').textContent = '-'
    document.getElementById('deaths').textContent = '-'
  }
}

async function callAction(action) {
  try {
    await fetch(`/api/${action}`, { method: 'POST' })
    refresh()
  } catch (err) {
    // Dashboard itself is unreachable - nothing to do client-side
  }
}

refresh()
setInterval(refresh, POLL_INTERVAL_MS)
