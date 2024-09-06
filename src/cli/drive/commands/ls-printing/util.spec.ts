import { sizeHumanReadable } from './util'

describe('sizeHumanReadable', () => {
  it('works', () => {
    expect(sizeHumanReadable(605)).toBe('605')
    expect(sizeHumanReadable(1024)).toBe('1.0K')
    expect(sizeHumanReadable(1024 + 512)).toBe('1.5K')
    expect(sizeHumanReadable(1024 * 1024)).toBe('1.0M')
  })
})
