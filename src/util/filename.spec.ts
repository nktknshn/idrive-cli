import { appendFilename } from './filename'

describe('appendFilename', () => {
  it('should append suffix to filename', () => {
    expect(appendFilename('test.txt', '.bak')).toBe('test.bak.txt')
    expect(appendFilename('test.txt', '.bak')).toBe('test.bak.txt')
    expect(appendFilename('test', '.bak')).toBe('test.bak')
    expect(appendFilename('test', '.bak')).toBe('test.bak')
  })
})
