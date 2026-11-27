import test from 'node:test'
import assert from 'node:assert/strict'
import { checkBodySize, createRateLimiter, getClientIp, readLimit } from './guards.mjs'

test('readLimit: 合法正数取整，缺省或非法回退默认值', () => {
  assert.equal(readLimit('30', 20), 30)
  assert.equal(readLimit('12.7', 20), 12)
  for (const bad of [undefined, '', 'abc', '0', '-5', NaN]) assert.equal(readLimit(bad, 20), 20)
})

test('getClientIp: 优先 Vercel 注入的头，其次 x-real-ip / x-forwarded-for 首个，最后 socket', () => {
  assert.equal(getClientIp({ headers: { 'x-vercel-forwarded-for': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' } }), '1.1.1.1')
  assert.equal(getClientIp({ headers: { 'x-real-ip': '2.2.2.2' } }), '2.2.2.2')
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': '3.3.3.3, 10.0.0.1' } }), '3.3.3.3')
  assert.equal(getClientIp({ headers: {}, socket: { remoteAddress: '4.4.4.4' } }), '4.4.4.4')
  assert.equal(getClientIp({ headers: {} }), 'unknown')
})

test('checkBodySize: 超限 413，非法 400，没带长度放行', () => {
  const limit = 1000
  assert.deepEqual(checkBodySize({ headers: { 'content-length': '1000' } }, limit), { ok: true })
  const tooBig = checkBodySize({ headers: { 'content-length': '1001' } }, limit)
  assert.equal(tooBig.ok, false)
  assert.equal(tooBig.status, 413)
  assert.equal(checkBodySize({ headers: { 'content-length': 'abc' } }, limit).status, 400)
  assert.equal(checkBodySize({ headers: { 'content-length': '-1' } }, limit).status, 400)
  assert.deepEqual(checkBodySize({ headers: {} }, limit), { ok: true })
})

test('createRateLimiter: 窗口内超过上限被拒，给出等待秒数，窗口过后恢复', () => {
  let t = 1_000_000
  const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t })
  assert.equal(limiter.check('a').ok, true)
  t += 1000
  assert.equal(limiter.check('a').ok, true)
  t += 1000
  assert.equal(limiter.check('a').ok, true)
  t += 1000
  const blocked = limiter.check('a')
  assert.equal(blocked.ok, false)
  assert.equal(blocked.retryAfterSec, 57)
  assert.equal(limiter.check('b').ok, true, '不同 IP 互不影响')
  t += 57_000
  assert.equal(limiter.check('a').ok, true, '最早一次滑出窗口后恢复')
})
