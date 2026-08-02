const express = require('express')
const path = require('path')
const botManager = require('./bot/bot')

const app = express()
app.use(express.static(path.join(__dirname, 'web')))

app.get('/api/status', (req, res) => {
  res.json(botManager.getState())
})

app.post('/api/connect', (req, res) => {
  botManager.connect()
  res.json({ ok: true })
})

app.post('/api/reconnect', (req, res) => {
  botManager.reconnect()
  res.json({ ok: true })
})

app.post('/api/disconnect', (req, res) => {
  botManager.disconnect()
  res.json({ ok: true })
})

// Railway sets its own PORT - always prefer that
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`[AFKbot] Dashboard running on port ${PORT}`)
})
