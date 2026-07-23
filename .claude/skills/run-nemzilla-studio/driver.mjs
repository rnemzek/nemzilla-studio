#!/usr/bin/env node
// Drives the live NemZilla Studio app in headless Chromium: spawns the real
// dev server (server.ts, Vite + Hono mounted together), loads the page,
// types terminal commands, and screenshots each step. See SKILL.md.
//
// Usage:
//   node driver.mjs                          # default smoke scenario
//   node driver.mjs /metrics /triad /clear   # run these AgentZ CLI slash commands in order
//
// Env:
//   PORT       port for the throwaway dev server (default 5301)
//   HEADED=1   launch a visible browser window instead of headless

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')
const PORT = Number(process.env.PORT ?? 5301)
const BASE_URL = `http://127.0.0.1:${PORT}`

const DEFAULT_COMMANDS = ['/help', '/metrics', '/triad', '/clear']
// Commands that stream the agent pipeline need longer than a plain command.
const STREAMING_COMMANDS = new Set(['/run', '/triad'])

mkdirSync(SCREENSHOT_DIR, { recursive: true })

function waitForHealthy(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  const attempt = async () => {
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`server did not become healthy within ${timeoutMs}ms`)
    await new Promise((r) => setTimeout(r, 200))
    return attempt()
  }
  return attempt()
}

async function main() {
  const commands = process.argv.slice(2)
  const script = commands.length > 0 ? commands : DEFAULT_COMMANDS

  const tsxBin = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx')
  const server = spawn(tsxBin, ['server.ts'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  server.stdout.on('data', (c) => (serverOutput += c.toString()))
  server.stderr.on('data', (c) => (serverOutput += c.toString()))

  const stopServer = () =>
    new Promise((resolve) => {
      server.once('exit', () => resolve())
      server.kill('SIGTERM')
      setTimeout(resolve, 2000)
    })

  let browser
  try {
    await waitForHealthy(BASE_URL)

    browser = await chromium.launch({ headless: process.env.HEADED !== '1' })
    const page = await browser.newPage()
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))

    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('text=AgentZ CLI')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-initial.png') })
    console.log('[00] initial load')
    const terminal = page.locator('[data-testid="terminal"]')
    console.log(await terminal.innerText())

    const input = page.locator('[data-testid="terminal"] textarea')

    for (const [i, command] of script.entries()) {
      const step = String(i + 1).padStart(2, '0')
      await input.fill(command)
      await input.press('Enter')
      const [name] = command.split(/\s+/)
      await page.waitForTimeout(STREAMING_COMMANDS.has(name) ? 2500 : 300)
      const shotPath = path.join(SCREENSHOT_DIR, `${step}-${name.replace(/^\//, '')}.png`)
      await page.screenshot({ path: shotPath })
      console.log(`\n[${step}] $ ${command}  ->  ${shotPath}`)
      console.log(await terminal.innerText())
    }

    // Sanity-check history recall on whatever the last command was.
    if (script.length > 0) {
      await input.press('ArrowUp')
      const afterUp = await input.inputValue()
      await input.press('ArrowDown')
      const afterDown = await input.inputValue()
      console.log(`\n[history] ArrowUp -> "${afterUp}", ArrowDown -> "${afterDown}"`)
    }

    console.log('\n[console errors]')
    console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)')

    if (consoleErrors.length > 0) process.exitCode = 1
  } catch (err) {
    console.error('\nFAIL:', err instanceof Error ? err.message : err)
    console.error('\n--- server output ---\n' + serverOutput)
    process.exitCode = 1
  } finally {
    if (browser) await browser.close()
    await stopServer()
  }
}

main()
