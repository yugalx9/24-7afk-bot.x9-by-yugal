const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalBlock } = goals
const fs = require('fs')
const path = require('path')

const settingsPath = path.join(__dirname, '..', 'settings.json')
function loadSettings() {
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
}

let bot = null
let timers = []
let startTime = null
let deathCount = 0
let currentActivity = 'idle'
let status = 'offline'
let manualDisconnect = false
let isReconnecting = false
let reconnectAttempts = 0
let wasThrottled = false
let spawnHandled = false
let connectionTimeoutId = null

function log(msg) {
  // Minimal logging on purpose - keeps CPU/memory low
  console.log(`[AFKbot] ${msg}`)
}

function clearTimers() {
  timers.forEach(clearInterval)
  timers = []
}

function clearConnectionTimeout() {
  if (connectionTimeoutId) {
    clearTimeout(connectionTimeoutId)
    connectionTimeoutId = null
  }
}

function canAct() {
  return bot && bot.entity && typeof bot.setControlState === 'function'
}

// Exponential backoff + jitter, with an extended cooldown if the server
// just throttled a reconnect attempt. This matches the proven pattern
// that keeps reconnects from hammering the server.
function getReconnectDelay(settings) {
  if (wasThrottled) {
    wasThrottled = false
    const throttleDelay = 60000 + Math.floor(Math.random() * 60000)
    log(`Throttle detected - using extended delay: ${(throttleDelay / 1000).toFixed(0)}s`)
    return throttleDelay
  }
  const r = settings.reconnect || {}
  const baseDelay = r.baseDelayMs || 3000
  const maxDelay = r.maxDelayMs || 30000
  const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay)
  const jitter = Math.floor(Math.random() * 2000)
  return delay + jitter
}

function scheduleReconnect() {
  clearConnectionTimeout()
  if (isReconnecting) {
    log('Reconnect already scheduled, skipping duplicate')
    return
  }
  isReconnecting = true
  reconnectAttempts++
  const settings = loadSettings()
  const delay = getReconnectDelay(settings)
  log(`Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${reconnectAttempts})`)
  setTimeout(() => {
    isReconnecting = false
    connect()
  }, delay)
}

function connect() {
  if (bot) {
    clearTimers()
    try {
      bot.removeAllListeners()
      bot.end()
    } catch (e) { /* ignore */ }
    bot = null
  }

  const settings = loadSettings()
  manualDisconnect = false
  status = 'connecting'
  spawnHandled = false

  log(`Connecting to ${settings.serverIp}:${settings.serverPort}`)

  bot = mineflayer.createBot({
    host: settings.serverIp,
    port: settings.serverPort,
    username: settings.username,
    // Connect as a well-supported client version rather than auto-detecting
    // the server's own version. Very new Minecraft releases can outpace
    // the library's protocol support, causing malformed movement packets
    // and "invalid_player_movement" kicks. Servers running ViaVersion
    // translate this older client version up to the real server version.
    version: (settings.minecraftVersion && settings.minecraftVersion.trim() !== '')
      ? settings.minecraftVersion
      : false,
    hideErrors: false,
    checkTimeoutInterval: 600000
  })

  bot.loadPlugin(pathfinder)

  // Aternos servers can take 90-120s to finish spawning a player, so give
  // it a generous window before giving up and retrying.
  clearConnectionTimeout()
  connectionTimeoutId = setTimeout(() => {
    if (status !== 'online') {
      log('Connection timeout - no spawn received')
      try { bot.removeAllListeners(); bot.end() } catch (e) { /* ignore */ }
      bot = null
      status = 'offline'
      scheduleReconnect()
    }
  }, 150000)

  bot.once('spawn', () => {
    if (spawnHandled) return
    spawnHandled = true
    clearConnectionTimeout()

    status = 'online'
    startTime = Date.now()
    reconnectAttempts = 0
    currentActivity = 'wandering'
    log(`Spawned and online (version: ${bot.version})`)

    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData)
    defaultMove.allowFreeMotion = false
    defaultMove.canDig = false
    defaultMove.liquidCost = 1000
    defaultMove.fallDamageCost = 1000

    startMovementLoops(defaultMove, settings.movement)
    startAutoEat()
  })

  bot.on('death', () => {
    deathCount++
    currentActivity = 'respawning'
    log('Died - respawning')
    try {
      bot.respawn()
    } catch (e) {
      log('Respawn error: ' + e.message)
    }
  })

  bot.on('kicked', (reason) => {
    const kickReason = typeof reason === 'object' ? JSON.stringify(reason) : reason
    log('Kicked: ' + kickReason)

    const reasonStr = String(kickReason).toLowerCase()
    if (reasonStr.includes('throttl') || reasonStr.includes('wait before reconnect') || reasonStr.includes('too fast')) {
      log('Throttle kick detected - will use extended reconnect delay')
      wasThrottled = true
    }
    // Don't schedule reconnect here - 'end' fires right after and handles it
  })

  bot.on('error', (err) => {
    log('Error: ' + err.message)
    // Don't reconnect on error - let 'end' handle it
  })

  bot.on('end', () => {
    clearTimers()
    clearConnectionTimeout()
    status = 'offline'
    currentActivity = 'idle'
    spawnHandled = false
    bot = null
    if (!manualDisconnect) {
      scheduleReconnect()
    }
  })
}

function startMovementLoops(defaultMove, m) {
  // Circle-walk: lets pathfinder compute a physics-correct step toward a
  // point on a small circle around the bot - the proven way to move
  // without triggering invalid-movement kicks.
  let angle = 0
  let lastPathTime = 0
  timers.push(setInterval(() => {
    if (!bot || status !== 'online') return
    const now = Date.now()
    if (now - lastPathTime < 2000) return
    lastPathTime = now
    try {
      const radius = m.circleWalkRadius || 4
      const x = bot.entity.position.x + Math.cos(angle) * radius
      const z = bot.entity.position.z + Math.sin(angle) * radius
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(
        new GoalBlock(Math.floor(x), Math.floor(bot.entity.position.y), Math.floor(z))
      )
      angle += Math.PI / 4
      currentActivity = 'wandering'
    } catch (e) {
      log('Circle-walk error: ' + e.message)
    }
  }, m.circleWalkIntervalMs || 3000))

  // Gentle look-around, force:false so it's not a snap rotation
  timers.push(setInterval(() => {
    if (!bot || status !== 'online') return
    try {
      const yaw = Math.random() * Math.PI * 2 - Math.PI
      const pitch = (Math.random() * Math.PI) / 2 - Math.PI / 4
      bot.look(yaw, pitch, false)
    } catch (e) { /* ignore */ }
  }, m.lookAroundIntervalMs || 5000))

  // Occasional jump
  timers.push(setInterval(() => {
    if (!canAct()) return
    try {
      bot.setControlState('jump', true)
      setTimeout(() => {
        if (canAct()) bot.setControlState('jump', false)
      }, 300)
    } catch (e) { /* ignore */ }
  }, m.jumpIntervalMs || 10000))

  // Occasional sprint
  timers.push(setInterval(() => {
    if (!canAct()) return
    bot.setControlState('sprint', true)
    currentActivity = 'sprinting'
    setTimeout(() => {
      if (canAct()) bot.setControlState('sprint', false)
    }, 2000)
  }, m.sprintIntervalMs || 20000))

  // Occasional crouch
  timers.push(setInterval(() => {
    if (!canAct()) return
    bot.setControlState('sneak', true)
    currentActivity = 'crouching'
    setTimeout(() => {
      if (canAct()) bot.setControlState('sneak', false)
    }, 2000)
  }, m.crouchIntervalMs || 25000))

  // Occasional block placement
  timers.push(setInterval(() => {
    placeRandomBlock()
  }, m.blockPlaceIntervalMs || 30000))
}

// Manual auto-eat, matching the proven approach - checks food level on
// every health update and eats directly, no extra plugin needed.
function startAutoEat() {
  bot.on('health', () => {
    if (!bot || status !== 'online') return
    try {
      if (bot.food < 14) {
        const food = bot.inventory.items().find(i => i.foodPoints && i.foodPoints > 0)
        if (food) {
          bot.equip(food, 'hand')
            .then(() => bot.consume())
            .catch((e) => log('AutoEat error: ' + e.message))
        }
      }
    } catch (e) {
      log('AutoEat error: ' + e.message)
    }
  })
}

function placeRandomBlock() {
  if (!canAct()) return
  const item = bot.inventory.items().find(i =>
    i.name.includes('_planks') ||
    i.name.includes('cobblestone') ||
    i.name.includes('dirt') ||
    i.name.includes('stone')
  )
  if (!item) {
    currentActivity = 'wandering'
    return
  }
  bot.equip(item, 'hand').then(() => {
    if (!canAct()) return
    const belowBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (belowBlock) {
      currentActivity = 'building'
      bot.placeBlock(belowBlock, { x: 0, y: 1, z: 0 }).catch(() => {})
    }
  }).catch(() => {})
}

function disconnect() {
  manualDisconnect = true
  clearTimers()
  clearConnectionTimeout()
  if (bot) {
    try {
      bot.removeAllListeners()
      bot.end()
    } catch (e) {
      log('Error while disconnecting: ' + e.message)
    }
  }
  bot = null
  status = 'offline'
  currentActivity = 'idle'
}

function reconnect() {
  disconnect()
  setTimeout(connect, 1000)
}

function getState() {
  const settings = loadSettings()
  if (!bot || status === 'offline') {
    return {
      version: settings.version,
      status: 'offline',
      health: 0,
      food: 0,
      position: null,
      dimension: null,
      activity: 'idle',
      uptimeMs: 0,
      deaths: deathCount,
      ping: 0,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    }
  }
  return {
    version: settings.version,
    status,
    health: bot.health || 0,
    food: bot.food || 0,
    position: bot.entity ? {
      x: bot.entity.position.x,
      y: bot.entity.position.y,
      z: bot.entity.position.z
    } : null,
    dimension: bot.game ? bot.game.dimension : null,
    activity: currentActivity,
    uptimeMs: startTime ? Date.now() - startTime : 0,
    deaths: deathCount,
    ping: (bot.player && bot.player.ping) || 0,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  }
}

module.exports = { connect, disconnect, reconnect, getState }
