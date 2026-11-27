import test from 'node:test'
import assert from 'node:assert/strict'
import { executeTool } from './tools.mjs'

const calc = expression => executeTool('calculate', { expression })

test('calculate: 原有四则、括号、取余保持不变', async () => {
  assert.equal((await calc('(128*36+50)/2')).output.result, 2329)
  assert.equal((await calc('10%3')).output.result, 1)
  assert.equal((await calc('-(2+3)*2')).output.result, -10)
})

test('calculate: 支持 ** 与 ^ 幂运算（工具描述里承诺过）', async () => {
  assert.equal((await calc('2**3')).output.result, 8)
  assert.equal((await calc('2^10')).output.result, 1024)
  assert.equal((await calc('(1+2)**2')).output.result, 9)
})

test('calculate: 幂运算优先级与结合性符合数学习惯', async () => {
  assert.equal((await calc('2^3^2')).output.result, 512, '右结合：2^(3^2)')
  assert.equal((await calc('-2^2')).output.result, -4, '幂高于一元负号')
  assert.equal((await calc('2^-1')).output.result, 0.5)
  assert.equal((await calc('2*3^2')).output.result, 18)
  assert.equal((await calc('2^3*4')).output.result, 32)
})

test('calculate: 结果无效或格式错误时返回失败而不是抛出或卡死', async () => {
  for (const bad of ['9**9**9**9', '(-8)^0.5', '0^-1', '1/0', '2***3', '2**', '**2', '2^^3', 'abc']) {
    const result = await calc(bad)
    assert.equal(result.ok, false, `${bad} 应当失败`)
  }
})
