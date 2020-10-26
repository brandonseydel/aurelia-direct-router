/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { IIndexable } from '@aurelia/kernel';
import { IBinding, IBindingContext, IOverrideContext, LifecycleFlags } from '../observation';
import { ProxyObserver } from './proxy-observer';

const marker = Object.freeze({});

export class BindingContext implements IBindingContext {
  [key: string]: unknown;

  private constructor(keyOrObj?: string | IIndexable, value?: unknown) {
    if (keyOrObj !== void 0) {
      if (value !== void 0) {
        // if value is defined then it's just a property and a value to initialize with
        this[keyOrObj as string] = value;
      } else {
        // can either be some random object or another bindingContext to clone from
        for (const prop in keyOrObj as IIndexable) {
          if (Object.prototype.hasOwnProperty.call(keyOrObj, prop)as boolean) {
            this[prop] = (keyOrObj as IIndexable)[prop];
          }
        }
      }
    }
  }

  /**
   * Create a new synthetic `BindingContext` for use in a `Scope`.
   *
   * @param obj - Optional. An existing object or `BindingContext` to (shallow) clone (own) properties from.
   */
  public static create(flags: LifecycleFlags, obj?: IIndexable): BindingContext;
  /**
   * Create a new synthetic `BindingContext` for use in a `Scope`.
   *
   * @param key - The name of the only property to initialize this `BindingContext` with.
   * @param value - The value of the only property to initialize this `BindingContext` with.
   */
  public static create(flags: LifecycleFlags, key: string, value: unknown): BindingContext;
  /**
   * Create a new synthetic `BindingContext` for use in a `Scope`.
   *
   * This overload signature is simply the combined signatures of the other two, and can be used
   * to keep strong typing in situations where the arguments are dynamic.
   */
  public static create(flags: LifecycleFlags, keyOrObj?: string | IIndexable, value?: unknown): BindingContext;
  public static create(flags: LifecycleFlags, keyOrObj?: string | IIndexable, value?: unknown): BindingContext {
    const bc = new BindingContext(keyOrObj, value);
    if (flags & LifecycleFlags.proxyStrategy) {
      return ProxyObserver.getOrCreate(bc).proxy;
    }
    return bc;
  }

  public static get(scope: Scope, name: string, ancestor: number, flags: LifecycleFlags, hostScope?: Scope | null): IBindingContext | IOverrideContext | IBinding | undefined | null {
    if (scope == null && hostScope == null) {
      throw new Error(`Scope is ${scope} and HostScope is ${hostScope}.`);
    }

    /* eslint-disable jsdoc/check-indentation */
    /**
     * This fallback is needed to support the following case:
     * <div au-slot="s1">
     *  <let outer-host.bind="$host"></let>
     *  ${outerHost.prop}
     * </div>
     * To enable the `let` binding for 'hostScope', the property is added to `hostScope.overrideContext`. That enables us to use such let binding also inside a repeater.
     * However, as the expression `${outerHost.prop}` does not start with `$host`, it is considered that to evaluate this expression, we don't need the access to hostScope.
     * This artifact raises the need for this fallback.
     */
    /* eslint-enable jsdoc/check-indentation */
    let context = chooseContext(scope, name, ancestor);
    if (context !== null) { return context; }
    if (hostScope !== scope && hostScope != null) {
      context = chooseContext(hostScope, name, ancestor);
      if (context !== null) { return context; }
    }

    // still nothing found. return the root binding context (or null
    // if this is a parent scope traversal, to ensure we fall back to the
    // correct level)
    if (flags & LifecycleFlags.isTraversingParentScope) {
      return marker;
    }
    return scope.bindingContext || scope.overrideContext;
  }
}

function chooseContext(scope: Scope, name: string, ancestor: number) {
  let overrideContext: IOverrideContext | null = scope.overrideContext;
  let currentScope: Scope | null = scope;

  if (ancestor > 0) {
    // jump up the required number of ancestor contexts (eg $parent.$parent requires two jumps)
    while (ancestor > 0) {
      ancestor--;
      currentScope = currentScope.parentScope;
      if (currentScope?.overrideContext == null) {
        return void 0;
      }
    }

    overrideContext = currentScope!.overrideContext;
    return name in overrideContext ? overrideContext : overrideContext.bindingContext;
  }

  // traverse the context and it's ancestors, searching for a context that has the name.
  while (overrideContext && !(name in overrideContext) && !(overrideContext.bindingContext && name in overrideContext.bindingContext)) {
    currentScope = currentScope!.parentScope ?? null;
    overrideContext = currentScope?.overrideContext ?? null;
  }

  if (overrideContext) {
    // we located a context with the property.  return it.
    return name in overrideContext ? overrideContext : overrideContext.bindingContext;
  }

  return null;
}

export class Scope {
  private constructor(
    public parentScope: Scope | null,
    public bindingContext: IBindingContext,
    public overrideContext: IOverrideContext,
  ) {}

  /**
   * Create a new `Scope` backed by the provided `BindingContext` and a new standalone `OverrideContext`.
   *
   * Use this overload when the scope is for the root component, in a unit test,
   * or when you simply want to prevent binding expressions from traversing up the scope.
   *
   * @param bc - The `BindingContext` to back the `Scope` with.
   */
  public static create(flags: LifecycleFlags, bc: object): Scope;
  /**
   * Create a new `Scope` backed by the provided `BindingContext` and `OverrideContext`.
   *
   * @param bc - The `BindingContext` to back the `Scope` with.
   * @param oc - The `OverrideContext` to back the `Scope` with.
   * If a binding expression attempts to access a property that does not exist on the `BindingContext`
   * during binding, it will traverse up via the `parentScope` of the scope until
   * it finds the property.
   */
  public static create(flags: LifecycleFlags, bc: object, oc: IOverrideContext): Scope;
  /**
   * Create a new `Scope` backed by the provided `BindingContext` and `OverrideContext`.
   *
   * Use this overload when the scope is for the root component, in a unit test,
   * or when you simply want to prevent binding expressions from traversing up the scope.
   *
   * @param bc - The `BindingContext` to back the `Scope` with.
   * @param oc - null. This overload is functionally equivalent to not passing this argument at all.
   */
  public static create(flags: LifecycleFlags, bc: object, oc: null): Scope;
  public static create(
    flags: LifecycleFlags,
    bc: object,
    oc?: IOverrideContext | null,
  ): Scope {
    return new Scope(null, bc as IBindingContext, oc == null ? OverrideContext.create(flags, bc) : oc);
  }

  public static fromOverride(flags: LifecycleFlags, oc: IOverrideContext): Scope {
    if (oc == null) {
      throw new Error(`OverrideContext is ${oc}`);
    }
    return new Scope(null, oc.bindingContext, oc);
  }

  public static fromParent(flags: LifecycleFlags, ps: Scope | null, bc: object): Scope {
    if (ps == null) {
      throw new Error(`ParentScope is ${ps}`);
    }
    return new Scope(ps, bc as IBindingContext, OverrideContext.create(flags, bc));
  }
}

export class OverrideContext implements IOverrideContext {
  [key: string]: unknown;

  public bindingContext: IBindingContext;

  private constructor(bindingContext: IBindingContext) {
    this.bindingContext = bindingContext;
  }

  public static create(flags: LifecycleFlags, bc: object): OverrideContext {
    return new OverrideContext(bc as IBindingContext);
  }
}
