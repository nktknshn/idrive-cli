import { Option } from 'fp-ts/lib/Option'
import * as t from 'io-ts'

const None = t.strict(
  { _tag: t.literal('None') },
  'None',
)

const someLiteral = t.literal('Some')

export type NoneOutput = t.OutputOf<typeof None>

export type SomeOutput<A> = { _tag: 'Some'; value: A }

export type OptionOutput<A> = NoneOutput | SomeOutput<A>

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OptionC<C extends t.Mixed> extends t.Type<Option<t.TypeOf<C>>, OptionOutput<t.OutputOf<C>>, unknown> {}

export function option<C extends t.Mixed>(codec: C, name: string = `Option<${codec.name}>`): OptionC<C> {
  return t.union([
    None,
    t.strict({ _tag: someLiteral, value: codec }, `Some<${codec.name}>`),
  ], name)
}
