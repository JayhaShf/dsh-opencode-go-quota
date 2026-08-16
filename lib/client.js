window.__ModuleLoader__.load({
  id: 'opencode-go-quota',
  factory: (require) => {
    'use strict'

    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const CSS = `
      .ocgo-quota { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; white-space: nowrap; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); padding: 2px 0; overflow: hidden; }
      .ocgo-quota__label { color: var(--dsw-alias-label-primary); }
      .ocgo-quota__sep { opacity: .45; }
      .ocgo-quota__error { color: var(--dsw-alias-state-error-primary); }
      .ocgo-quota__ok { color: var(--dsw-alias-state-success-primary); }
      .ocgo-quota__hint { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .ocgo-quota__window { display: inline-flex; align-items: center; gap: 4px; }
      .ocgo-quota__bar { display: inline-block; width: 44px; height: 6px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
      .ocgo-quota__bar-fill { display: block; height: 100%; border-radius: 3px; background: var(--dsw-alias-brand-primary); }
      .ocgo-quota__bar-fill--warn { background: var(--dsw-alias-state-warn-primary); }
      .ocgo-quota__bar-fill--hot { background: var(--dsw-alias-state-error-primary); }
      .ocgo-settings { display: flex; flex-direction: column; gap: 12px; max-width: 520px; font-size: 13px; }
      .ocgo-settings__field { display: flex; flex-direction: column; gap: 4px; }
      .ocgo-settings__label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .ocgo-settings__input { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
      .ocgo-settings__input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .ocgo-settings__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .ocgo-btn { border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
      .ocgo-btn:hover { border-color: var(--dsw-alias-border-l2); }
      .ocgo-btn:disabled { opacity: .55; cursor: default; }
    `
    const TAG = 'opencode-go-quota/ui.css'
    if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${TAG}"]`)) {
      const style = document.createElement('style')
      style.dataset.plugin = 'opencode-go-quota'
      style.dataset.pluginCss = TAG
      style.textContent = CSS
      document.head.appendChild(style)
    }

    const STORAGE_KEY = 'opencode-go-quota:apiKey'
    const DEFAULT_BASE = 'https://opencode.ai'

    function api(path, body) {
      const options = body === undefined
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
      return fetch(path, options).then((response) => response.json())
    }

    function time(iso) {
      if (!iso) return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    function percent(value) {
      if (value === null || value === undefined) return '—'
      return `${(Math.round(value * 10) / 10).toFixed(1)}%`
    }

    function useStatus(intervalMs) {
      const [status, setStatus] = React.useState(null)
      const restoredRef = React.useRef(false)

      const load = React.useCallback(async () => {
        try {
          const next = await api('/ocgo-quota/status')
          setStatus(next)
          if (!next.configured && !restoredRef.current) {
            const savedKey = localStorage.getItem(STORAGE_KEY)
            if (savedKey) {
              restoredRef.current = true
              await api('/ocgo-quota/config', { apiKey: savedKey, baseUrl: next.baseUrl || DEFAULT_BASE })
              const fresh = await api('/ocgo-quota/status')
              setStatus(fresh)
            }
          }
        } catch {
          // ignore transient failures; next poll retries
        }
      }, [])

      React.useEffect(() => {
        load()
        const timer = setInterval(load, intervalMs)
        return () => clearInterval(timer)
      }, [load, intervalMs])

      return { status, reload: load }
    }

    function QuotaWindow({ label, window }) {
      const pct = window && typeof window.percent === 'number' ? window.percent : null
      const fillClass = pct === null
        ? 'ocgo-quota__bar-fill'
        : pct >= 90
          ? 'ocgo-quota__bar-fill ocgo-quota__bar-fill--hot'
          : pct >= 80
            ? 'ocgo-quota__bar-fill ocgo-quota__bar-fill--warn'
            : 'ocgo-quota__bar-fill'
      const barWidth = pct === null ? 0 : Math.min(100, pct)

      return React.createElement('span', { className: 'ocgo-quota__window' },
        React.createElement('span', null, label),
        React.createElement('span', { className: 'ocgo-quota__bar' },
          React.createElement('span', { className: fillClass, style: { width: barWidth + '%' } })),
        React.createElement('span', null, percent(pct)),
        window && window.resetsAt ? React.createElement('span', { className: 'ocgo-quota__sep' }, time(window.resetsAt)) : null)
    }

    function DockWidget() {
      const { status } = useStatus(15000)

      if (!status) return null

      if (!status.configured) {
        return React.createElement('div', { className: 'ocgo-quota' },
          React.createElement('span', { className: 'ocgo-quota__label' }, 'OpenCode Go'),
          React.createElement('span', null, '未设置 Key · 设置 → OpenCode Go 余量'))
      }

      if (status.lastError && !status.snapshot) {
        return React.createElement('div', { className: 'ocgo-quota ocgo-quota__error' },
          `OpenCode Go：${status.lastError}`)
      }

      if (!status.snapshot) {
        return React.createElement('div', { className: 'ocgo-quota' },
          React.createElement('span', { className: 'ocgo-quota__label' }, 'OpenCode Go'),
          React.createElement('span', null, '获取中…'))
      }

      const usage = status.snapshot.usage
      return React.createElement('div', { className: 'ocgo-quota' },
        React.createElement('span', { className: 'ocgo-quota__label' }, 'OpenCode Go'),
        React.createElement(QuotaWindow, { label: '5h', window: usage.rolling }),
        React.createElement('span', { className: 'ocgo-quota__sep' }, '·'),
        React.createElement(QuotaWindow, { label: '周', window: usage.weekly }),
        React.createElement('span', { className: 'ocgo-quota__sep' }, '·'),
        React.createElement(QuotaWindow, { label: '月', window: usage.monthly }),
        React.createElement('span', { className: 'ocgo-quota__sep' }, '|'),
        React.createElement('span', null, `刷新 ${time(status.snapshot.fetchedAt)}`))
    }

    function SettingsSection() {
      const { status, reload } = useStatus(60000)
      const [seeded, setSeeded] = React.useState(false)
      const [apiKey, setApiKey] = React.useState('')
      const [baseUrl, setBaseUrl] = React.useState(DEFAULT_BASE)
      const [intervalSec, setIntervalSec] = React.useState(300)
      const [message, setMessage] = React.useState(null)
      const [testResult, setTestResult] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        if (status && !seeded) {
          setSeeded(true)
          setBaseUrl(status.baseUrl || DEFAULT_BASE)
          if (status.pollIntervalSec) setIntervalSec(status.pollIntervalSec)
        }
      }, [status, seeded])

      async function save() {
        setBusy(true)
        setMessage(null)
        try {
          const trimmedKey = apiKey.trim()
          const result = await api('/ocgo-quota/config', {
            apiKey: trimmedKey || undefined,
            baseUrl: baseUrl.trim(),
            pollIntervalSec: intervalSec,
          })
          if (result && result.ok) {
            if (trimmedKey) localStorage.setItem(STORAGE_KEY, trimmedKey)
            else localStorage.removeItem(STORAGE_KEY)
            setMessage('已保存')
            setApiKey('')
          } else {
            setMessage((result && result.error) || '保存失败')
          }
        } catch (error) {
          setMessage(error && error.message ? error.message : String(error))
        }
        setBusy(false)
        reload()
      }

      async function test() {
        setBusy(true)
        setTestResult(null)
        try {
          const result = await api('/ocgo-quota/test', {
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
          })
          if (result && result.ok) {
            const u = result.snapshot.usage
            setTestResult(`连接成功：5h ${percent(u.rolling.percent)} · 周 ${percent(u.weekly.percent)} · 月 ${percent(u.monthly.percent)}`)
          } else {
            setTestResult((result && result.error) || '测试失败')
          }
        } catch (error) {
          setTestResult(error && error.message ? error.message : String(error))
        }
        setBusy(false)
      }

      async function clearKey() {
        setBusy(true)
        try {
          localStorage.removeItem(STORAGE_KEY)
          await api('/ocgo-quota/config', { apiKey: '' })
          setApiKey('')
          setMessage('已清除 Key')
        } catch (error) {
          setMessage(error && error.message ? error.message : String(error))
        }
        setBusy(false)
        reload()
      }

      const hasKey = status && status.configured
      const statusText = hasKey
        ? `已配置 ${status.keyMasked || ''} · 上次检查 ${status.lastCheckedAt ? time(status.lastCheckedAt) : '—'}`
        : '尚未配置 API Key'

      return React.createElement('div', { className: 'ocgo-settings' },
        React.createElement('div', { className: 'ocgo-settings__hint' },
          '设置 OpenCode Go API Key 后，插件会调用官方额度接口并把余量/刷新时间显示在会话统计行下方。'),
        React.createElement('div', { className: 'ocgo-settings__field' },
          React.createElement('label', { className: 'ocgo-settings__label' }, 'API Key'),
          React.createElement('input', {
            className: 'ocgo-settings__input',
            type: 'password',
            value: apiKey,
            placeholder: hasKey ? `已保存：${status.keyMasked}（留空保持不变）` : 'sk-…',
            onChange: (event) => setApiKey(event.target.value),
          })),
        React.createElement('div', { className: 'ocgo-settings__field' },
          React.createElement('label', { className: 'ocgo-settings__label' }, '接口地址'),
          React.createElement('input', {
            className: 'ocgo-settings__input',
            type: 'text',
            value: baseUrl,
            onChange: (event) => setBaseUrl(event.target.value),
          })),
        React.createElement('div', { className: 'ocgo-settings__field' },
          React.createElement('label', { className: 'ocgo-settings__label' }, '刷新间隔'),
          React.createElement('select', {
            className: 'ocgo-settings__input',
            value: intervalSec,
            onChange: (event) => setIntervalSec(Number(event.target.value)),
          },
            React.createElement('option', { value: 60 }, '1 分钟'),
            React.createElement('option', { value: 300 }, '5 分钟'),
            React.createElement('option', { value: 900 }, '15 分钟'),
            React.createElement('option', { value: 1800 }, '30 分钟'))),
        React.createElement('div', { className: 'ocgo-settings__row' },
          React.createElement('button', { className: 'ocgo-btn', disabled: busy, onClick: save }, '保存'),
          React.createElement('button', { className: 'ocgo-btn', disabled: busy, onClick: test }, '测试连接'),
          hasKey ? React.createElement('button', { className: 'ocgo-btn', disabled: busy, onClick: clearKey }, '清除 Key') : null),
        message ? React.createElement('div', { className: 'ocgo-quota__ok' }, message) : null,
        testResult ? React.createElement('div', { className: 'ocgo-quota__error' }, testResult) : null,
        React.createElement('div', { className: 'ocgo-settings__hint' }, statusText))
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
        { name: 'conversation.composer.dock', id: 'opencode-go-quota-dock', order: 20 },
        DockWidget))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'opencode-go-quota', order: 50, label: 'OpenCode Go 余量' },
        SettingsSection))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
