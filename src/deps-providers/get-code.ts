import { Getcode, input } from '../util/prompts'

export const getCode: Getcode = () => input({ message: 'code: ' })
