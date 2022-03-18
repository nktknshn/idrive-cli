import * as E from 'fp-ts/lib/Either'
import * as R from 'fp-ts/lib/Record'
import * as t from 'io-ts'

export function omit<C extends t.HasProps, K extends keyof t.OutputOf<C>>(key: K, codec: C): OmitC<C, K> {
  const props: t.Props = getProps(codec)
  const keys = Object.getOwnPropertyNames(props)
  const types = keys.map((key) => props[key])
  const len = keys.length

  return new OmitType(
    'StrictType',
    (u): u is any => {
      if (!t.UnknownRecord.is(u)) {
        console.log('false')
        return false
      }

      for (const k of keys) {
        if (k !== key) {
          if (!props[k].is(u[k])) {
            console.log('false')
            return false
          }
        }
      }
      console.log('true')
      return true
    },
    (u, c) => {
      const e = t.UnknownRecord.validate(u, c)

      if (E.isLeft(e)) {
        return e
      }

      const o = e.right
      const errors: t.Errors = []
      const a = { ...o }

      for (let i = 0; i < len; i++) {
        const k = keys[i]

        if (k == key) {
          continue
        }

        const ak = a[k]
        const type = props[k]

        const result = type.validate(ak, t.appendContext(c, k, type, ak))

        if (E.isLeft(result)) {
          if (ak !== undefined) {
            pushAll(errors, result.left)
          }
        }
        else {
          const vak = result.right
          a[k] = vak
          // if (vak !== ak) {
          //   if (a === o) {
          //     a = { ...o }
          //   }
          //   a[k] = vak
          // }
        }
      }
      return errors.length > 0 ? t.failures(errors) : t.success(a as any)
    },
    (a) => codec.encode(R.deleteAt(key as string)(a)),
    codec,
    key,
  )
}

export class OmitType<
  C extends t.HasProps,
  K extends keyof t.OutputOf<C>,
  A = any,
  O = A,
  I = unknown,
> extends t.Type<A, O, I> {
  readonly _tag: 'StrictType' = 'StrictType'
  props: t.Props

  constructor(
    name: string,
    is: OmitType<C, K, A, O, I>['is'],
    validate: OmitType<C, K, A, O, I>['validate'],
    encode: OmitType<C, K, A, O, I>['encode'],
    readonly codec: C,
    readonly key: K,
  ) {
    super(name, is, validate, encode)
    this.props = R.deleteAt(key as string)(getProps(codec))
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface OmitC<
  C extends t.HasProps,
  K extends keyof t.OutputOf<C>,
> extends
  OmitType<
    C,
    K,
    Omit<t.TypeOf<C>, K>,
    Omit<t.OutputOf<C>, K>,
    unknown
  >
{}

function getProps(codec: t.HasProps): t.Props {
  switch (codec._tag) {
    case 'RefinementType':
    case 'ReadonlyType':
      return getProps(codec.type)
    case 'InterfaceType':
    case 'StrictType':
    case 'PartialType':
      return codec.props
    case 'IntersectionType':
      return codec.types.reduce<t.Props>((props, type) => Object.assign(props, getProps(type)), {})
      // case 'OmitType':
      //   return R.deleteAt(codec.key as string)(getProps(codec.codec))
  }
}

function pushAll<A>(xs: Array<A>, ys: Array<A>): void {
  const l = ys.length
  for (let i = 0; i < l; i++) {
    xs.push(ys[i])
  }
}
