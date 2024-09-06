export const sizeHumanReadable = (size: number) => {
  const units = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']

  if (size < 1024) {
    return `${size}`
  }

  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  // round up
  size = Math.ceil(size * 10) / 10

  return `${size.toFixed(1)}${units[i]}`
}
