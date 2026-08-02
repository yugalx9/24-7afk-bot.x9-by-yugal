const mineflayer = require('mineflayer')
const autoEatPlugin = require('mineflayer-auto-eat').plugin
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
let reconnectAttempts = 0

function log(msg) {
  // Minimal logging on purpose - keeps CPU/memory low
  console.log(`[AFKbot] ${msg}`)
}

function clearTimers() {
  timers.forEach(clearInterval)
  timers = []
}

// Small random range so reconnects don't hit the server at a predictable
// rhythm - helps avoid hosts (like Aternos) rate-limiting rapid reconnects.
function randomMs(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

function getReconnectDelay() {
  let delay = randomMs(4000, 8000)
  if (reconnectAttempts > 3) delay += 5000
  return Math.min(delay, 60000)
}

function canAct() {
  return bot && bot.entity && typeof bot.setControlState === 'function'
}

function connect() {
  if (bot && status !== 'offline') {
    log('Already connecting/online - skipping duplicate connect')
    return
  }

  const settings = loadSettings()
  manualDisconnect = false
  status = 'connecting'

  bot = mineflayer.createBot({
    host: settings.serverIp,
    port: settings.serverPort,
    username: settings.username,
    version: false // auto-detects the server's version
  })

  bot.loadPlugin(autoEatPlugin)

  bot.once('spawn', () => {
    status = 'online'
    startTime = Date.now()
    reconnectAttempts = 0
    currentActivity = 'wandering'
    log('Spawned and online')

    if (bot.autoEat) {
      bot.autoEat.options = { priority: 'foodPoints', startAt: 16, bannedFood: [] }
    }

    const m = settings.movement

    // Simple random wander - no pathfinding.
    // Stops moving before turning, and turns with force:false (not an
    // instant snap) so the server's anti-cheat doesn't flag it as an
    // invalid/teleport-like movement.
    timers.push(setInterval(() => {
      if (!canAct()) return
      bot.setControlState('forward', false)
      const targetYaw = bot.entity.yaw + (Math.random() * 2 - 1) * (Math.PI / 3)
      bot.look(targetYaw, 0, false)
      setTimeout(() => {
        if (!canAct()) return
        bot.setControlState('forward', true)
        currentActivity = 'wandering'
        setTimeout(() => {
          if (canAct()) bot.setControlState('forward', false)
        }, m.walkDurationMs)
      }, 300)
    }, m.wanderIntervalMs))

    // Occasional sprint
    timers.push(setInterval(() => {
      if (!canAct()) return
      bot.setControlState('sprint', true)
      currentActivity = 'sprinting'
      setTimeout(() => {
        if (canAct()) bot.setControlState('sprint', false)
      }, 2000)
    }, m.sprintIntervalMs))

    // Occasional crouch
    timers.push(setInterval(() => {
      if (!canAct()) return
      bot.setControlState('sneak', true)
      currentActivity = 'crouching'
      setTimeout(() => {
        if (canAct()) bot.setControlState('sneak', false)
      }, 2000)
    }, m.crouchIntervalMs))

    // Occasional block placement
    timers.push(setInterval(() => {
      placeRandomBlock()
    }, m.blockPlaceIntervalMs))
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
    log('Kicked: ' + JSON.stringify(reason))
  })

  bot.on('error', (err) => {
    log('Error: ' + err.message)
  })

  bot.on('end', () => {
    clearTimers()
    status = 'offline'
    currentActivity = 'idle'
    bot = null
    if (!manualDisconnect) {
      reconnectAttempts++
      const delay = getReconnectDelay()
      log(`Disconnected - reconnecting in ${(delay / 1000).toFixed(1)}s`)
      setTimeout(connect, delay)
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
  if (bot) {
    try {
      if (typeof bot.quit === 'function') {
        bot.quit()
      } else if (bot._client && typeof bot._client.end === 'function') {
        bot._client.end()
      }
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
