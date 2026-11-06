/**
 * Traces the screen as shapes, from the live DOM: every visible line of text as
 * a bar, every filled control as a block, every outlined one as an outline,
 * every partial border as a hairline. The current sidebar item keeps its name.
 * Returns plain data for plan.js.
 */
export const SKETCH = `(() => {
  const VW = innerWidth, VH = innerHeight
  const out = []
  const alpha = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(/[ ,\\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1 }
  const light = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return 0; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(parseFloat); return (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11) / 255 }
  const shown = (el, x, y) => {
    if (x < 0 || y < 0 || x >= VW || y >= VH) return false
    const top = document.elementFromPoint(x, y)
    return Boolean(top) && (top === el || el.contains(top) || top.contains(el))
  }
  const clip = (r) => {
    const x = Math.max(0, r.x), y = Math.max(0, r.y)
    const w = Math.min(VW, r.x + r.width) - x, h = Math.min(VH, r.y + r.height) - y
    return w > 0.5 && h > 0.5 ? { x, y, w, h } : null
  }
  const nav = document.querySelector('nav[aria-label="App"]')
  const current = nav?.querySelector('[aria-current="page"]')
  const navItems = {}
  for (const a of nav ? nav.querySelectorAll('a, button') : []) {
    const r = a.getBoundingClientRect()
    const name = a.textContent.trim().replace(/\\d+$/, '').trim()
    if (name) navItems[name] = { y: r.y + r.height / 2, x: r.x, w: r.width, h: r.height }
  }
  let active = null
  if (current) {
    const r = current.getBoundingClientRect()
    const cs = getComputedStyle(current)
    let label = null
    const walker = document.createTreeWalker(current, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) if (walker.currentNode.textContent.trim() && !/^\\d+$/.test(walker.currentNode.textContent.trim())) { label = walker.currentNode; break }
    const range = document.createRange(); if (label) range.selectNodeContents(label)
    const lr = label ? range.getBoundingClientRect() : r
    active = { name: label?.textContent.trim(), x: lr.x, y: lr.y, w: lr.width, h: lr.height, font: getComputedStyle(label.parentElement).font, color: getComputedStyle(label.parentElement).color, box: { x: r.x, y: r.y, w: r.width, h: r.height, r: parseFloat(cs.borderRadius) || 0 } }
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const c = clip(r)
    if (!c) continue
    const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, c.h / 2)
    const visible = shown(el, c.x + c.w / 2, c.y + c.h / 2) || shown(el, c.x + 2, c.y + 2) || shown(el, c.x + c.w - 2, c.y + c.h - 2)
    const area = c.w * c.h
    // A fill.
    const bg = cs.backgroundColor
    if (alpha(bg) > 0.02 && visible && el !== document.body && el.id !== 'root') {
      if (area > VW * VH * 0.12) out.push([c.x, c.y, c.w, c.h, rad, 'area', bg])
      else if (!(current && (el === current || current.contains(el))) || el === current) out.push([c.x, c.y, c.w, c.h, rad, light(bg) > 0.6 ? 'solid' : 'box', light(bg) > 0.6 ? 0.5 : Math.min(0.14, 0.05 + alpha(bg) * 0.06)])
    }
    // Borders.
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => parseFloat(cs['border' + s + 'Width']) > 0 && alpha(cs['border' + s + 'Color']) > 0.04 && cs['border' + s + 'Style'] !== 'none')
    if (sides.every(Boolean) && area < VW * VH * 0.25) { if (visible) out.push([c.x, c.y, c.w, c.h, rad, 'hollow']) }
    else {
      if (sides[0]) out.push([c.x, r.y, c.w, 1, 0, 'line'])
      if (sides[2]) out.push([c.x, r.y + r.height - 1, c.w, 1, 0, 'line'])
      if (sides[1]) out.push([r.x + r.width - 1, c.y, 1, c.h, 0, 'line'])
      if (sides[3]) out.push([r.x, c.y, 1, c.h, 0, 'line'])
    }
    // An icon.
    if (el.tagName === 'svg' && c.w <= 40 && c.h <= 40 && visible && !(current && current.contains(el) && false)) out.push([c.x + c.w * 0.15, c.y + c.h * 0.15, c.w * 0.7, c.h * 0.7, 3, 'icon'])
  }
  // Text, line by line.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    if (!el || (current && current.contains(el) && node.textContent.trim() === active?.name)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
    range.selectNodeContents(node)
    const fs = parseFloat(cs.fontSize)
    const tone = light(cs.color) > 0.8 ? 'text' : light(cs.color) > 0.15 && light(cs.color) < 0.4 ? 'ink' : 'mute'
    for (const r of range.getClientRects()) {
      const c = clip(r)
      if (!c || c.w < 2) continue
      if (!shown(el, c.x + c.w / 2, c.y + c.h / 2)) continue
      const h = Math.max(3, Math.round(fs * 0.5))
      out.push([c.x, c.y + (c.h - h) / 2, c.w, h, h / 2, tone])
    }
  }
  return { blocks: out.map((b) => b.map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v))), nav: navItems, active }
})()`

/**
 * The version lift on Results, element by element: each line of text with its
 * box and type, the ribbon's SVG with its colors written in, and the rule under
 * the figure. `group` is 'ribbon' for what sits in the ribbon's box.
 */
export const LIFT = `(() => {
  const fig = document.querySelector('figure[aria-label^="Version lift"]')
  if (!fig) return null
  const box = (r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })
  const ribbon = fig.lastElementChild
  const texts = []
  const walker = document.createTreeWalker(fig, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    const cs = getComputedStyle(el)
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    texts.push({
      text: cs.textTransform === 'uppercase' ? node.textContent.toUpperCase() : node.textContent,
      ...box(r),
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, mono: /mono/i.test(cs.fontFamily),
      color: cs.color, spacing: cs.letterSpacing, line: cs.lineHeight,
      group: ribbon.contains(el) ? 'ribbon' : 'head',
    })
  }
  const svg = ribbon.querySelector('svg')
  const clone = svg.cloneNode(true)
  const src = [...svg.querySelectorAll('*')]
  ;[...clone.querySelectorAll('*')].forEach((n, i) => {
    const cs = getComputedStyle(src[i])
    n.removeAttribute('class')
    if (n.tagName === 'path') n.setAttribute('fill', cs.fill)
    if (n.tagName === 'line') { n.setAttribute('stroke', cs.stroke); n.setAttribute('stroke-width', cs.strokeWidth) }
  })
  clone.removeAttribute('class')
  const fcs = getComputedStyle(fig)
  const fr = fig.getBoundingClientRect()
  return {
    figure: box(fr),
    ribbon: box(ribbon.getBoundingClientRect()),
    svg: { ...box(svg.getBoundingClientRect()), html: clone.outerHTML },
    rule: { x: fr.x, y: fr.y + fr.height - parseFloat(fcs.borderBottomWidth), w: fr.width, h: parseFloat(fcs.borderBottomWidth), color: fcs.borderBottomColor },
    ground: getComputedStyle(document.querySelector('main')).backgroundColor,
    texts,
  }
})()`

/**
 * The word diff on Compare, as it is drawn: its box, and every run of text cut
 * into one piece per line, each with its kind ('same', 'del' struck through,
 * 'ins' marked), box and type. The film rebuilds it to animate the changes.
 */
export const DIFF = `(() => {
  const main = document.querySelector('main')
  const struck = [...main.querySelectorAll('*')].find((e) => getComputedStyle(e).textDecorationLine.includes('line-through'))
  if (!struck) return null
  let box = struck.parentElement
  while (box && box.getBoundingClientRect().height < 260) box = box.parentElement
  const kindOf = (el) => {
    for (let e = el; e && e !== box; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.textDecorationLine.includes('line-through')) return { kind: 'del', mark: cs.textDecorationColor, bg: cs.backgroundColor }
      const bg = cs.backgroundColor
      if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg) && e.tagName !== 'CODE') return { kind: 'ins', bg }
    }
    return { kind: 'same' }
  }
  const pieces = []
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = node.textContent
    if (!text.trim()) continue
    const el = node.parentElement
    const cs = getComputedStyle(el)
    const k = kindOf(el)
    let start = 0
    let top = null
    const flush = (end) => {
      if (end <= start) return
      range.setStart(node, start)
      range.setEnd(node, end)
      const r = range.getBoundingClientRect()
      const s = text.slice(start, end)
      if (s.trim()) pieces.push({ text: s, x: r.x, y: r.y, w: r.width, h: r.height, size: parseFloat(cs.fontSize), weight: cs.fontWeight, mono: /mono/i.test(cs.fontFamily), color: cs.color, ...k })
      start = end
    }
    for (let i = 0; i < text.length; i += 1) {
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const rects = range.getClientRects()
      if (!rects.length) continue
      const y = Math.round(rects[rects.length - 1].top)
      if (top !== null && Math.abs(y - top) > 4) flush(i)
      top = y
    }
    flush(text.length)
  }
  const r = box.getBoundingClientRect()
  return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, ground: getComputedStyle(box).backgroundColor, radius: getComputedStyle(box).borderTopLeftRadius, pieces }
})()`
