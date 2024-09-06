import { sizeHumanReadable } from './util'

describe('sizeHumanReadable', () => {
  it('works', () => {
    expect(sizeHumanReadable(605)).toBe('605')
    expect(sizeHumanReadable(1024)).toBe('1.0K')
    // should round up
    expect(sizeHumanReadable(1024 + 1)).toBe('1.1K')
    expect(sizeHumanReadable(1024 * 1024)).toBe('1.0M')
    expect(sizeHumanReadable(1024 * 1024 + 1)).toBe('1.1M')
    expect(sizeHumanReadable(1024 * 1024 * 1.1 + 1)).toBe('1.2M')
  })
})
