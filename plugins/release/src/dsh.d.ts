/**
 * 本地类型声明：插件在宿主之外开发时，这些包由 dsh 安装提供，
 * 仓库里不装它们，所以这里给出最小可用的类型，保证 `tsc --noEmit` 与构建可跑。
 * 真实运行时用的是宿主安装的那一份。
 */

declare module '@deepseek-ai/cordis' {
  export interface ToolRegistrationOptions {
    when?: (ctx: { agent?: unknown; modelSelection?: unknown; signal: AbortSignal }) => boolean | Promise<boolean>;
  }

  export interface ToolsService {
    register(definition: unknown, options?: ToolRegistrationOptions): void;
  }

  /** 浏览器端的 slot 注册表（宿主 ui-slots 服务的最小契约）。 */
  export interface SlotsService {
    /** 等 slot 被父级声明后执行回调；返回的 disposer 随插件卸载执行。 */
    inject(slot: string, callback: () => void | (() => void)): void;
    /** 注册一个条目；options 的形状由 slot 契约决定（list 用 id，main 用 key）。 */
    register(options: Record<string, unknown>, component: unknown): () => void;
  }

  export interface Context {
    tools: ToolsService;
    slots: SlotsService;
    /** 注册随插件卸载自动清理的资源，返回的 disposer 在卸载时执行 */
    effect(fn: () => void | (() => void)): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    plugin(plugin: unknown): unknown;
    /** 可选依赖：deps 里的服务都就绪时执行回调，否则等到就绪（headless 下 webServer 永不就绪） */
    inject(deps: string[], callback: (ctx: Context) => void): void;
    /** 取已注册的服务实例，未注册时返回 undefined */
    get(name: string): unknown;
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export interface ToolExecutionContext {
    /** 调用方持有的取消信号，长任务必须观察它 */
    signal: AbortSignal;
    callId: string;
    name: string;
    agent?: unknown;
  }

  /** 统一 schema DSL 里工具参数支持的基本节点 */
  export interface ParameterNode {
    type: 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'json';
    required?: boolean;
    description?: string;
    enum?: readonly (string | number)[];
    items?: ParameterNode;
    properties?: Record<string, ParameterNode>;
    additionalProperties?: boolean;
  }

  export type ParameterSchema = Record<string, ParameterNode>;

  /** 规范化输出的 schema 节点（宽松描述，避免过度约束） */
  export interface ValueNode {
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, ValueNode>;
    items?: ValueNode;
    required?: boolean | readonly string[];
    additionalProperties?: boolean;
    enum?: readonly (string | number)[];
    description?: string;
  }

  export interface ContentBlock {
    type: 'text';
    text: string;
  }

  export interface RenderIntent {
    card: 'generic';
    title: string;
    kind?: 'read' | 'search' | 'other';
    rawInput?: unknown;
  }

  export interface ToolDefinition<Args = unknown, Value = unknown> {
    name: string;
    description: string;
    parameters: ParameterSchema;
    output: {
      schema: ValueNode;
      render: (args: Args, value: Value) => ContentBlock[];
      presentationMeta?: (args: Args, value: Value) => unknown;
    };
    execute: (args: Args, exec: ToolExecutionContext) => Value | Promise<Value>;
    presentCall?: (args: Args) => RenderIntent;
  }

  export function defineTool<Args, Value>(definition: ToolDefinition<Args, Value>): ToolDefinition<Args, Value>;
}

declare module '@deepseek-ai/schemastery' {
  export interface SchemaLike<T> {
    readonly __value?: T;
    default(value: T): SchemaLike<T>;
    required(): SchemaLike<T>;
    description(text: string): SchemaLike<T>;
    min(value: number): SchemaLike<T>;
    max(value: number): SchemaLike<T>;
    step(value: number): SchemaLike<T>;
  }

  export interface SchemaFactory {
    object<T extends object>(shape: { [K in keyof T]: SchemaLike<T[K]> }): SchemaLike<T>;
    string(): SchemaLike<string>;
    number(): SchemaLike<number>;
    boolean(): SchemaLike<boolean>;
    array<T>(inner: SchemaLike<T>): SchemaLike<T[]>;
    union<T extends string | number>(values: readonly T[]): SchemaLike<T>;
  }

  const Schema: SchemaFactory;
  export default Schema;
}
