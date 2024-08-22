export const printerIO = {
  print: <T>(value: T) =>
    () => {
      console.log(value)
    },
  error: () =>
    (value: Error | string) =>
      () => {
        console.error(value)
      },
  printTask: <T>(value: T): () => Promise<void> =>
    async () => {
      console.log(value)
    },
  errorTask: (value: Error): () => Promise<void> =>
    async () => {
      console.error(value.message)
    },
}
export const printer = {
  print: <T>(value: T): void => {
    console.log(value)
  },
  error: (value: Error | string): void => {
    console.error(value)
  },
  printTask: <T>(value: T): () => Promise<void> =>
    async () => {
      console.log(value)
    },
  errorTask: (value: Error): () => Promise<void> =>
    async () => {
      console.error(value.message)
    },
}
